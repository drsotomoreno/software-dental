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
  frontendRedirectAfterOAuth,
  getGoogleOAuthConfigStatus,
  readGoogleDriveStatusForUser,
  resolveManagedClinicId,
} from '../services/googleDriveOAuth.service.js'

const router = Router()

/** Escaneos STL/PLY/OBJ clínicos: hasta 100 MB. */
export const GOOGLE_DRIVE_MAX_UPLOAD_BYTES = 100 * 1024 * 1024

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: GOOGLE_DRIVE_MAX_UPLOAD_BYTES,
    fieldSize: GOOGLE_DRIVE_MAX_UPLOAD_BYTES,
  },
})

function bearerToken(req) {
  const authHeader = req.headers.authorization ?? ''
  return authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null
}

async function requireSessionUser(req, res) {
  const session = await resolveSubscriptionSession(bearerToken(req), sessionHintFromRequest(req))
  if (!session?.user) {
    res.status(401).json({
      success: false,
      ok: false,
      error: 'Sesión inválida o expirada.',
      code: 'UNAUTHORIZED',
    })
    return null
  }
  return session.user
}

/** Clínica objetivo (superadmin puede elegir otra sede vía query/body). */
function requestedClinicIdFrom(req) {
  const query = req.query && typeof req.query === 'object' ? req.query : {}
  const body = req.body && typeof req.body === 'object' ? req.body : {}
  return String(
    query.clinicId ||
      query.tenant_id ||
      query.clinica_id ||
      body.clinicId ||
      body.tenant_id ||
      body.clinica_id ||
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

/** Estado de conexión Drive de la clínica canónica de la sesión. */
router.get('/status', async (req, res) => {
  try {
    const user = await requireSessionUser(req, res)
    if (!user) return
    const status = await readGoogleDriveStatusForUser(user, {
      clinicId: requestedClinicIdFrom(req),
    })
    return res.json({ success: true, ok: true, ...status })
  } catch (error) {
    console.error('[google-drive] GET /status:', error)
    const mapped = mapOAuthError(error)
    return res.status(mapped.status).json({
      success: false,
      ok: false,
      error: mapped.message,
      code: mapped.code,
    })
  }
})

/**
 * Inicia OAuth: genera URL con access_type=offline, prompt=consent, scope drive.file.
 * Por defecto responde JSON `{ url }` para el SPA. `?redirect=1` redirige al navegador.
 */
router.get('/connect', async (req, res) => {
  try {
    const user = await requireSessionUser(req, res)
    if (!user) return

    const { url, clinicId } = buildGoogleDriveConnectUrl(user, {
      clinicId: requestedClinicIdFrom(req),
    })
    if (String(req.query?.redirect || '') === '1') {
      return res.redirect(302, url)
    }
    return res.json({
      success: true,
      ok: true,
      url,
      clinicId,
      oauth: getGoogleOAuthConfigStatus(),
    })
  } catch (error) {
    console.error('[google-drive] GET /connect:', error)
    const mapped = mapOAuthError(error)
    return res.status(mapped.status).json({
      success: false,
      ok: false,
      error: mapped.message,
      code: mapped.code,
    })
  }
})

/**
 * Callback de Google: intercambia code, cifra refresh_token, crea carpeta raíz
 * `mihistoriadental - [Nombre]` y redirige al frontend.
 */
router.get('/callback', async (req, res) => {
  try {
    const query = req.query && typeof req.query === 'object' ? req.query : {}
    if (query.error) {
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
      return res.redirect(
        302,
        frontendRedirectAfterOAuth({ ok: false, errorCode: 'OAUTH_CALLBACK_INVALID' }),
      )
    }

    await completeGoogleDriveOAuthCallback({ code, state })
    return res.redirect(302, frontendRedirectAfterOAuth({ ok: true }))
  } catch (error) {
    console.error('[google-drive] GET /callback:', error)
    const mapped = mapOAuthError(error)
    return res.redirect(
      302,
      frontendRedirectAfterOAuth({ ok: false, errorCode: mapped.code }),
    )
  }
})

/** Desconecta Drive de la clínica (borra tokens cifrados y metadatos). */
router.post('/disconnect', async (req, res) => {
  try {
    const user = await requireSessionUser(req, res)
    if (!user) return
    const status = await disconnectGoogleDriveForUser(user, {
      clinicId: requestedClinicIdFrom(req),
    })
    return res.json({ success: true, ok: true, ...status })
  } catch (error) {
    console.error('[google-drive] POST /disconnect:', error)
    const mapped = mapOAuthError(error)
    return res.status(mapped.status).json({
      success: false,
      ok: false,
      error: mapped.message,
      code: mapped.code,
    })
  }
})

/**
 * Proxy de descarga: bytes del adjunto en Drive para el visor 3D / caché IndexedDB.
 * GET /api/integrations/google-drive/file/:fileId
 */
router.get('/file/:fileId', async (req, res) => {
  try {
    const user = await requireSessionUser(req, res)
    if (!user) return

    const fileId = String(req.params.fileId || '').trim()
    if (!fileId) {
      return res.status(400).json({
        success: false,
        ok: false,
        error: 'fileId es obligatorio.',
        code: 'INVALID_FILE_ID',
      })
    }

    let clinicId
    try {
      clinicId = resolveManagedClinicId(user, requestedClinicIdFrom(req))
    } catch (error) {
      const mapped = mapOAuthError(error)
      return res.status(mapped.status).json({
        success: false,
        ok: false,
        error: mapped.message,
        code: mapped.code,
      })
    }

    if (!clinicId) {
      return res.status(400).json({
        success: false,
        ok: false,
        error: 'No se pudo resolver clinicId / clinicSyncId de la sesión.',
        code: 'CLINIC_REQUIRED',
      })
    }

    const buffer = await downloadClinicAttachmentFromDrive({
      clinicId,
      driveFileId: fileId,
    })
    if (!buffer || !buffer.length) {
      return res.status(404).json({
        success: false,
        ok: false,
        error: 'Archivo no encontrado en Google Drive.',
        code: 'DRIVE_FILE_NOT_FOUND',
      })
    }

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
      return res.status(428).json({
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
    return res.status(mapped.status).json({
      success: false,
      ok: false,
      error: mapped.message,
      code: mapped.code,
    })
  }
})

/**
 * Subida inmediata de adjunto clínico (exámenes / escaneos).
 * Acepta multipart (`file`) hasta 100 MB o JSON legacy `{ dataBase64 }` (también ≤ 100 MB).
 */
router.post('/upload', (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    const parsed = parseMulterError(err)
    if (parsed) {
      return res.status(parsed.status).json({
        success: false,
        ok: false,
        error: parsed.message,
        code: parsed.code,
      })
    }
    return next()
  })
}, async (req, res) => {
  try {
    const user = await requireSessionUser(req, res)
    if (!user) return

    const body = req.body && typeof req.body === 'object' ? req.body : {}
    const fileName = String(
      req.file?.originalname || body.fileName || body.name || '',
    ).trim()
    const mimeType = String(
      req.file?.mimetype || body.mimeType || 'application/octet-stream',
    ).trim()
    const patientSyncId = String(
      body.patientSyncId || body.patientId || body.patient_sync_id || 'sin-paciente',
    ).trim()
    const aidId = String(body.aidId || body.id || '').trim()
    const existingFileId = String(body.driveFileId || '').trim() || undefined

    let clinicId
    try {
      clinicId = resolveManagedClinicId(user, requestedClinicIdFrom(req))
    } catch (error) {
      const mapped = mapOAuthError(error)
      return res.status(mapped.status).json({
        success: false,
        ok: false,
        error: mapped.message,
        code: mapped.code,
        clinicId: null,
      })
    }

    if (!clinicId) {
      return res.status(400).json({
        success: false,
        ok: false,
        error: 'No se pudo resolver clinicId / clinicSyncId de la sesión autenticada.',
        code: 'CLINIC_REQUIRED',
      })
    }

    let buffer = req.file?.buffer || null
    if (!buffer) {
      const dataBase64 = String(body.dataBase64 || body.data || '').trim()
      if (!dataBase64) {
        return res.status(400).json({
          success: false,
          ok: false,
          error: 'Envíe el archivo en multipart (campo "file") o dataBase64.',
          code: 'INVALID_UPLOAD_PAYLOAD',
        })
      }
      try {
        buffer = Buffer.from(dataBase64, 'base64')
      } catch {
        return res.status(400).json({
          success: false,
          ok: false,
          error: 'dataBase64 inválido.',
          code: 'INVALID_BASE64',
        })
      }
    }

    if (!fileName) {
      return res.status(400).json({
        success: false,
        ok: false,
        error: 'fileName es obligatorio.',
        code: 'INVALID_UPLOAD_PAYLOAD',
      })
    }
    if (!buffer || !buffer.length) {
      return res.status(400).json({
        success: false,
        ok: false,
        error: 'El archivo está vacío.',
        code: 'EMPTY_ATTACHMENT_BUFFER',
      })
    }
    if (buffer.length > GOOGLE_DRIVE_MAX_UPLOAD_BYTES) {
      return res.status(400).json({
        success: false,
        ok: false,
        error: `El archivo supera el límite de ${Math.round(GOOGLE_DRIVE_MAX_UPLOAD_BYTES / (1024 * 1024))} MB.`,
        code: 'FILE_TOO_LARGE',
      })
    }

    const uploaded = await uploadClinicAttachmentToDrive({
      clinicId,
      patientSyncId,
      fileName,
      mimeType,
      buffer,
      driveFileId: existingFileId,
      appProperties: {
        source: 'diagnostic_aid',
        ...(aidId ? { aidId } : {}),
      },
    })

    return res.json({
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
      return res.status(428).json({
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
    return res.status(mapped.status >= 400 ? mapped.status : 500).json({
      success: false,
      ok: false,
      error: mapped.message,
      code: mapped.code,
    })
  }
})

export default router
