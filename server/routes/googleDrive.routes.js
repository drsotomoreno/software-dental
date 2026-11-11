import { Router } from 'express'
import {
  resolveSubscriptionSession,
  sessionHintFromRequest,
} from '../services/subscriptionAuthStore.js'
import {
  buildGoogleDriveConnectUrl,
  completeGoogleDriveOAuthCallback,
  disconnectGoogleDriveForUser,
  frontendRedirectAfterOAuth,
  getGoogleOAuthConfigStatus,
  readGoogleDriveStatusForUser,
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
    const status = await readGoogleDriveStatusForUser(user)
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

    const { url, clinicId } = buildGoogleDriveConnectUrl(user)
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
    const status = await disconnectGoogleDriveForUser(user)
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

export default router
