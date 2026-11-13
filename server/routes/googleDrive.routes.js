import { Router } from 'express'
import {
  resolveSubscriptionSession,
  sessionHintFromRequest,
} from '../services/subscriptionAuthStore.js'
import {
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

function bearerToken(req) {
  const authHeader = req.headers.authorization ?? ''
  return authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null
}

async function requireSessionUser(req, res) {
  const session = await resolveSubscriptionSession(bearerToken(req), sessionHintFromRequest(req))
  if (!session?.user) {
    res.status(401).json({ success: false, ok: false, error: 'Sesión inválida o expirada.' })
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
 * Subida inmediata de adjunto clínico (exámenes / escaneos) a la carpeta
 * pacientes/{patientSyncId}/ayudas/ de la clínica en Google Drive.
 * Body JSON: { fileName, mimeType, dataBase64, patientSyncId?, aidId?, driveFileId? }
 */
router.post('/upload', async (req, res) => {
  try {
    const user = await requireSessionUser(req, res)
    if (!user) return

    const body = req.body && typeof req.body === 'object' ? req.body : {}
    const fileName = String(body.fileName || body.name || '').trim()
    const mimeType = String(body.mimeType || 'application/octet-stream').trim()
    const dataBase64 = String(body.dataBase64 || body.data || '').trim()
    const patientSyncId = String(
      body.patientSyncId || body.patientId || body.patient_sync_id || 'sin-paciente',
    ).trim()
    const aidId = String(body.aidId || body.id || '').trim()
    const existingFileId = String(body.driveFileId || '').trim() || undefined
    const clinicId = resolveManagedClinicId(user, requestedClinicIdFrom(req))

    if (!clinicId) {
      return res.status(400).json({
        success: false,
        ok: false,
        error: 'No se pudo resolver la clínica de la sesión.',
        code: 'CLINIC_REQUIRED',
      })
    }
    if (!fileName || !dataBase64) {
      return res.status(400).json({
        success: false,
        ok: false,
        error: 'fileName y dataBase64 son obligatorios.',
        code: 'INVALID_UPLOAD_PAYLOAD',
      })
    }

    let buffer
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
    if (!buffer.length) {
      return res.status(400).json({
        success: false,
        ok: false,
        error: 'El archivo está vacío.',
        code: 'EMPTY_ATTACHMENT_BUFFER',
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
    return res.status(mapped.status).json({
      success: false,
      ok: false,
      error: mapped.message,
      code: mapped.code,
    })
  }
})

export default router
