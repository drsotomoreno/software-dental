import { randomUUID } from 'node:crypto'
import { mkdir, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Router } from 'express'
import multer from 'multer'
import {
  resolveSubscriptionSession,
  sessionHintFromRequest,
} from '../services/subscriptionAuthStore.js'
import {
  downloadClinicAttachmentFromDrive,
  GoogleDriveRequiredError,
  isGoogleDriveRequiredError,
  uploadClinicAttachmentToDrive,
} from '../services/googleDriveAttachments.service.js'
import {
  buildGoogleDriveConnectUrl,
  completeGoogleDriveOAuthCallback,
  disconnectGoogleDriveForUser,
  findClinicDriveCredentials,
  frontendRedirectAfterOAuth,
  getGoogleOAuthConfigStatus,
  readGoogleDriveStatusForUser,
} from '../services/googleDriveOAuth.service.js'

const router = Router()

/** Evita double-send / Connection reset by peer (104) si el socket ya cerró. */
function sendJson(res, status, body) {
  if (res.headersSent || res.writableEnded) return
  return res.status(status).json(body)
}

/** Escaneos STL/PLY/OBJ clínicos: hasta 100 MB. */
export const GOOGLE_DRIVE_MAX_UPLOAD_BYTES = 100 * 1024 * 1024

/** Disco temporal: stream a Drive sin cargar el STL en RAM. */
const DRIVE_UPLOAD_TMP_DIR = join(tmpdir(), 'drive-uploads')

const diskStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    mkdir(DRIVE_UPLOAD_TMP_DIR, { recursive: true })
      .then(() => cb(null, DRIVE_UPLOAD_TMP_DIR))
      .catch((err) => cb(err))
  },
  filename: (_req, file, cb) => {
    const safe = String(file.originalname || 'upload.bin')
      .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, '_')
      .slice(0, 120)
    cb(null, `${Date.now()}-${randomUUID()}-${safe}`)
  },
})

const upload = multer({
  storage: diskStorage,
  limits: {
    fileSize: GOOGLE_DRIVE_MAX_UPLOAD_BYTES,
    fieldSize: 2 * 1024 * 1024,
  },
})

async function unlinkTempUpload(file) {
  const path = file?.path
  if (!path) return
  try {
    await unlink(path)
  } catch {
    // ignore
  }
}

function bearerToken(req) {
  const authHeader = req.headers.authorization ?? ''
  return authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null
}

async function requireSessionUser(req, res) {
  const session = await resolveSubscriptionSession(bearerToken(req), sessionHintFromRequest(req))
  if (!session?.user) {
    sendJson(res, 401, {
      success: false,
      ok: false,
      error: 'Sesión inválida o expirada.',
      code: 'UNAUTHORIZED',
    })
    return null
  }
  req.user = session.user
  return session.user
}

/** clinicId desde header/query (disponible antes de que multer llene body). */
function earlyClinicIdFrom(req) {
  const query = req.query && typeof req.query === 'object' ? req.query : {}
  const headers = req.headers && typeof req.headers === 'object' ? req.headers : {}
  return String(
    headers['x-clinic-id'] ||
      headers['X-Clinic-Id'] ||
      query.clinicId ||
      query.tenant_id ||
      query.clinica_id ||
      '',
  ).trim()
}

function mapOAuthError(error) {
  const status = Number(error?.status) || 500
  const code = error?.code || 'GOOGLE_DRIVE_ERROR'
  const message =
    error instanceof Error ? error.message : 'Error en la integración de Google Drive.'
  return { status: status >= 400 && status < 600 ? status : 500, code, message }
}

function parseMulterError(err) {
  if (!err) return null
  if (err.code === 'LIMIT_FILE_SIZE') {
    return {
      status: 400,
      code: 'FILE_TOO_LARGE',
      message: `El archivo supera el límite de ${Math.round(GOOGLE_DRIVE_MAX_UPLOAD_BYTES / (1024 * 1024))} MB.`,
    }
  }
  if (err instanceof multer.MulterError) {
    return {
      status: 400,
      code: err.code || 'UPLOAD_PARSE_ERROR',
      message: err.message || 'No se pudo leer el archivo enviado.',
    }
  }
  return {
    status: 400,
    code: 'UPLOAD_PARSE_ERROR',
    message: err instanceof Error ? err.message : 'No se pudo leer el archivo enviado.',
  }
}

/** Estado de conexión Drive — misma resolución de claves que upload/file/disconnect. */
router.get('/status', async (req, res) => {
  try {
    const user = await requireSessionUser(req, res)
    if (!user) return
    const status = await readGoogleDriveStatusForUser(user, { req })
    return sendJson(res, 200, { success: true, ok: true, ...status })
  } catch (error) {
    console.error('[google-drive] GET /status:', error)
    const mapped = mapOAuthError(error)
    return sendJson(res, mapped.status, {
      success: false,
      ok: false,
      error: mapped.message,
      code: mapped.code,
    })
  }
})

/**
 * Inicia OAuth: genera URL con access_type=offline, prompt=consent, scope drive.file.
 */
router.get('/connect', async (req, res) => {
  try {
    const user = await requireSessionUser(req, res)
    if (!user) return

    const resolved = await findClinicDriveCredentials(req, user)
    const { url, clinicId } = buildGoogleDriveConnectUrl(user, {
      clinicId: earlyClinicIdFrom(req) || resolved.clinicId || '',
    })
    if (String(req.query?.redirect || '') === '1') {
      if (res.headersSent || res.writableEnded) return
      return res.redirect(302, url)
    }
    return sendJson(res, 200, {
      success: true,
      ok: true,
      url,
      clinicId,
      oauth: getGoogleOAuthConfigStatus(),
    })
  } catch (error) {
    console.error('[google-drive] GET /connect:', error)
    const mapped = mapOAuthError(error)
    return sendJson(res, mapped.status, {
      success: false,
      ok: false,
      error: mapped.message,
      code: mapped.code,
    })
  }
})

router.get('/callback', async (req, res) => {
  try {
    const query = req.query && typeof req.query === 'object' ? req.query : {}
    if (query.error) {
      if (res.headersSent || res.writableEnded) return
      return res.redirect(
        302,
        frontendRedirectAfterOAuth({
          ok: false,
          errorCode: String(query.error),
        }),
      )
    }
    const code = String(query.code || '').trim()
    const state = String(query.state || '').trim()
    if (!code || !state) {
      if (res.headersSent || res.writableEnded) return
      return res.redirect(
        302,
        frontendRedirectAfterOAuth({ ok: false, errorCode: 'OAUTH_CALLBACK_INVALID' }),
      )
    }

    await completeGoogleDriveOAuthCallback({ code, state })
    if (res.headersSent || res.writableEnded) return
    return res.redirect(302, frontendRedirectAfterOAuth({ ok: true }))
  } catch (error) {
    console.error('[google-drive] GET /callback:', error)
    const mapped = mapOAuthError(error)
    if (res.headersSent || res.writableEnded) return
    return res.redirect(
      302,
      frontendRedirectAfterOAuth({ ok: false, errorCode: mapped.code }),
    )
  }
})

/** Desconecta Drive — misma resolución de claves que status/upload. */
router.post('/disconnect', async (req, res) => {
  try {
    const user = await requireSessionUser(req, res)
    if (!user) return
    const status = await disconnectGoogleDriveForUser(user, { req })
    return sendJson(res, 200, { success: true, ok: true, ...status })
  } catch (error) {
    console.error('[google-drive] POST /disconnect:', error)
    const mapped = mapOAuthError(error)
    return sendJson(res, mapped.status, {
      success: false,
      ok: false,
      error: mapped.message,
      code: mapped.code,
    })
  }
})

/**
 * Proxy de descarga: bytes del adjunto en Drive.
 * GET /api/integrations/google-drive/file/:fileId
 */
router.get('/file/:fileId', async (req, res) => {
  try {
    const user = await requireSessionUser(req, res)
    if (!user) return

    const fileId = String(req.params.fileId || '').trim()
    if (!fileId) {
      return sendJson(res, 400, {
        success: false,
        ok: false,
        error: 'fileId es obligatorio.',
        code: 'INVALID_FILE_ID',
      })
    }

    const resolved = await findClinicDriveCredentials(req, user)
    const clinicId = resolved.storageKey || resolved.clinicId
    if (!clinicId) {
      return sendJson(res, 400, {
        success: false,
        ok: false,
        error: 'No se pudo resolver clinicId / clinicSyncId de la sesión.',
        code: 'CLINIC_REQUIRED',
      })
    }
    if (!resolved.connected) {
      return sendJson(res, 428, {
        success: false,
        ok: false,
        error:
          'La clínica debe conectar Google Drive antes de descargar adjuntos.',
        code: 'google_drive_required',
        clinicId,
      })
    }

    const buffer = await downloadClinicAttachmentFromDrive({
      clinicId,
      clinicIdCandidates: resolved.candidates,
      driveFileId: fileId,
    })
    if (!buffer || !buffer.length) {
      return sendJson(res, 404, {
        success: false,
        ok: false,
        error: 'Archivo no encontrado en Google Drive.',
        code: 'DRIVE_FILE_NOT_FOUND',
      })
    }

    if (res.headersSent || res.writableEnded) return
    const mimeType = String(req.query.mimeType || 'application/octet-stream').trim()
    const fileName = String(req.query.fileName || fileId).trim()
    res.setHeader('Content-Type', mimeType || 'application/octet-stream')
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${fileName.replace(/"/g, '')}"`,
    )
    res.setHeader('Content-Length', String(buffer.length))
    res.setHeader('Cache-Control', 'private, max-age=60')
    return res.status(200).send(buffer)
  } catch (error) {
    console.error('[google-drive] GET /file:', error)
    if (isGoogleDriveRequiredError(error) || error instanceof GoogleDriveRequiredError) {
      return sendJson(res, 428, {
        success: false,
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : 'La clínica debe conectar Google Drive antes de descargar adjuntos.',
        code: 'google_drive_required',
      })
    }
    const mapped = mapOAuthError(error)
    return sendJson(res, mapped.status, {
      success: false,
      ok: false,
      error: mapped.message,
      code: mapped.code,
    })
  }
})

/**
 * Subida inmediata. Lee X-Clinic-Id / query.clinicId antes y después de multer.
 */
router.post('/upload', (req, res, next) => {
  // Capturar clinicId temprano (header/query) por si body aún no existe.
  req.driveClinicIdHint = earlyClinicIdFrom(req)
  upload.single('file')(req, res, (err) => {
    const parsed = parseMulterError(err)
    if (parsed) {
      return sendJson(res, parsed.status, {
        success: false,
        ok: false,
        error: parsed.message,
        code: parsed.code,
      })
    }
    return next()
  })
}, async (req, res) => {
  const tempFile = req.file
  try {
    const user = await requireSessionUser(req, res)
    if (!user) return

    const body = req.body && typeof req.body === 'object' ? req.body : {}
    // Reinyectar hint pre-multer si body no trae clinicId.
    if (req.driveClinicIdHint && !body.clinicId) {
      body.clinicId = req.driveClinicIdHint
      req.body = body
    }

    const fileName = String(
      tempFile?.originalname || body.fileName || body.name || '',
    ).trim()
    const mimeType = String(
      tempFile?.mimetype || body.mimeType || 'application/octet-stream',
    ).trim()
    const patientSyncId = String(
      body.patientSyncId || body.patientId || body.patient_sync_id || 'sin-paciente',
    ).trim()
    const aidId = String(body.aidId || body.id || '').trim()
    const existingFileId = String(body.driveFileId || '').trim() || undefined

    const resolved = await findClinicDriveCredentials(req, user)
    const clinicId = resolved.storageKey || resolved.clinicId

    if (!clinicId) {
      return sendJson(res, 400, {
        success: false,
        ok: false,
        error: 'No se pudo resolver clinicId / clinicSyncId de la sesión autenticada.',
        code: 'CLINIC_REQUIRED',
      })
    }
    if (!resolved.connected) {
      return sendJson(res, 428, {
        success: false,
        ok: false,
        error:
          'Google Drive no está conectado. Conéctelo en Perfil → Google Drive.',
        code: 'google_drive_required',
        clinicId,
        triedKeys: resolved.candidates?.slice(0, 12),
      })
    }

    const diskPath = String(tempFile?.path || '').trim()
    const diskSize = Number(tempFile?.size) || 0
    let smallBuffer = null

    // Solo aceptar Base64 para payloads pequeños de respaldo (< 1 MB); STL va por disco.
    if (!diskPath) {
      const dataBase64 = String(body.dataBase64 || body.data || '').trim()
      if (!dataBase64) {
        return sendJson(res, 400, {
          success: false,
          ok: false,
          error: 'Envíe el archivo en multipart (campo "file").',
          code: 'INVALID_UPLOAD_PAYLOAD',
        })
      }
      if (dataBase64.length > 1.4 * 1024 * 1024) {
        return sendJson(res, 400, {
          success: false,
          ok: false,
          error: 'Use multipart/form-data para archivos grandes (sin Base64).',
          code: 'BASE64_UPLOAD_DISABLED',
        })
      }
      try {
        smallBuffer = Buffer.from(dataBase64, 'base64')
      } catch {
        return sendJson(res, 400, {
          success: false,
          ok: false,
          error: 'dataBase64 inválido.',
          code: 'INVALID_BASE64',
        })
      }
    }

    if (!fileName) {
      return sendJson(res, 400, {
        success: false,
        ok: false,
        error: 'fileName es obligatorio.',
        code: 'INVALID_UPLOAD_PAYLOAD',
      })
    }
    const byteLength = diskPath ? diskSize : smallBuffer?.length || 0
    if (!byteLength) {
      return sendJson(res, 400, {
        success: false,
        ok: false,
        error: 'El archivo está vacío.',
        code: 'EMPTY_ATTACHMENT_BUFFER',
      })
    }
    if (byteLength > GOOGLE_DRIVE_MAX_UPLOAD_BYTES) {
      return sendJson(res, 400, {
        success: false,
        ok: false,
        error: `El archivo supera el límite de ${Math.round(GOOGLE_DRIVE_MAX_UPLOAD_BYTES / (1024 * 1024))} MB.`,
        code: 'FILE_TOO_LARGE',
      })
    }

    const uploaded = await uploadClinicAttachmentToDrive({
      clinicId,
      clinicIdCandidates: resolved.candidates,
      patientSyncId,
      fileName,
      mimeType,
      filePath: diskPath || undefined,
      byteLength,
      buffer: smallBuffer || undefined,
      driveFileId: existingFileId,
      appProperties: {
        source: 'diagnostic_aid',
        ...(aidId ? { aidId } : {}),
      },
    })

    return sendJson(res, 200, {
      success: true,
      ok: true,
      clinicId,
      driveFileId: uploaded.driveFileId,
      webViewLink: uploaded.webViewLink,
      byteLength: uploaded.byteLength,
      storageBackend: uploaded.storageBackend,
    })
  } catch (error) {
    console.error('[google-drive] POST /upload:', error)
    if (isGoogleDriveRequiredError(error) || error instanceof GoogleDriveRequiredError) {
      return sendJson(res, 428, {
        success: false,
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : 'La clínica debe conectar Google Drive antes de subir adjuntos.',
        code: 'google_drive_required',
      })
    }
    const mapped = mapOAuthError(error)
    return sendJson(res, mapped.status >= 400 ? mapped.status : 500, {
      success: false,
      ok: false,
      error: mapped.message,
      code: mapped.code,
    })
  } finally {
    await unlinkTempUpload(tempFile)
  }
})

export default router
