import {
  resolveSubscriptionSession,
  sessionHintFromRequest,
  MASTER_EMAIL,
} from '../services/subscriptionAuthStore.js'
import { enviarRipsMensuales, getMonthlyRipsJobStatus } from '../services/monthlyRipsSubmission.js'
import { nextMonthlyRunDate } from '../jobs/monthlyRipsCron.js'

function bearerToken(req) {
  const authHeader = req.headers.authorization ?? ''
  return authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null
}

async function requireSuperAdmin(req) {
  const session = await resolveSubscriptionSession(bearerToken(req), sessionHintFromRequest(req))
  if (!session?.user) return null
  const email = String(session.user.email ?? '').toLowerCase()
  const rol = String(session.user.rol ?? '').toLowerCase()
  if (email !== MASTER_EMAIL && rol !== 'superadmin') return null
  return session
}

export async function getMonthlyRipsStatus(req, res, next) {
  try {
    const session = await requireSuperAdmin(req)
    if (!session) {
      return res.status(403).json({ success: false, ok: false, error: 'No autorizado.' })
    }
    const status = await getMonthlyRipsJobStatus()
    return res.json({
      success: true,
      ok: true,
      ...status,
      nextRunAt: nextMonthlyRunDate().toISOString(),
    })
  } catch (error) {
    next(error)
  }
}

export async function runMonthlyRipsJob(req, res, next) {
  try {
    const session = await requireSuperAdmin(req)
    if (!session) {
      return res.status(403).json({ success: false, ok: false, error: 'No autorizado.' })
    }
    const body = req.body && typeof req.body === 'object' ? req.body : {}
    const dryRun = body.dryRun === true || req.query?.dryRun === 'true'
    const summary = await enviarRipsMensuales({ dryRun, submit: !dryRun })
    const status = summary.skipped ? 409 : summary.ok ? 200 : 422
    return res.status(status).json({ success: summary.ok === true, ...summary })
  } catch (error) {
    next(error)
  }
}
