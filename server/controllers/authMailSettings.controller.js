import { MASTER_EMAIL, resolveSubscriptionSession, sessionHintFromRequest } from '../services/subscriptionAuthStore.js'
import { isMailConfigured, mailTransportLabel } from '../services/mailer.js'
import { loadMailSettings, publicMailStatus, saveMailSettings } from '../services/mailSettingsStore.js'

async function requireSuperAdmin(req) {
  const authHeader = req.headers.authorization ?? ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null
  const session = await resolveSubscriptionSession(token, sessionHintFromRequest(req))
  if (!session?.user) return null
  const email = String(session.user.email ?? '').toLowerCase()
  const rol = String(session.user.rol ?? '').toLowerCase()
  if (email !== MASTER_EMAIL && rol !== 'superadmin') return null
  return session
}

export async function getMailSettings(req, res) {
  try {
    const session = await requireSuperAdmin(req)
    if (!session) {
      return res.status(403).json({ success: false, ok: false, error: 'No autorizado.' })
    }
    const settings = await loadMailSettings()
    return res.json({
      success: true,
      ok: true,
      mail: {
        ...publicMailStatus(settings, await isMailConfigured()),
        transport: await mailTransportLabel(),
      },
    })
  } catch (error) {
    console.error('[Auth] Error en GET /auth/mail-settings:', error)
    return res.status(500).json({ success: false, ok: false, error: 'No se pudo leer la configuración de correo.' })
  }
}

export async function updateMailSettings(req, res) {
  try {
    const session = await requireSuperAdmin(req)
    if (!session) {
      return res.status(403).json({ success: false, ok: false, error: 'No autorizado.' })
    }
    const body = req.body && typeof req.body === 'object' ? req.body : {}
    const saved = await saveMailSettings({
      brevoApiKey: body.brevoApiKey,
      resendApiKey: body.resendApiKey,
      sendgridApiKey: body.sendgridApiKey,
      from: body.from,
    })
    return res.json({
      success: true,
      ok: true,
      message: 'Configuración de correo guardada.',
      mail: {
        ...publicMailStatus(saved, await isMailConfigured()),
        transport: await mailTransportLabel(),
      },
    })
  } catch (error) {
    console.error('[Auth] Error en PUT /auth/mail-settings:', error)
    return res.status(500).json({ success: false, ok: false, error: 'No se pudo guardar la configuración de correo.' })
  }
}
