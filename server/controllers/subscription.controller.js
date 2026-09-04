import {
  resolveSubscriptionSession,
  selectPaidPlan,
  startRethusTrial,
} from '../services/subscriptionAuthStore.js'
import { PAID_PLANS, TRIAL_DAYS } from '../../shared/subscriptionPlans.js'

function bearerToken(req) {
  const authHeader = req.headers.authorization ?? ''
  return authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null
}

export async function getSubscriptionStatus(req, res) {
  try {
    const session = await resolveSubscriptionSession(bearerToken(req))
    if (!session?.user) {
      return res.status(401).json({ success: false, ok: false, error: 'Sesión inválida o expirada.' })
    }
    return res.json({
      success: true,
      ok: true,
      user: session.user,
      requiresSubscription: session.requiresSubscription === true || session.active === false,
      trialDays: TRIAL_DAYS,
      plans: PAID_PLANS,
    })
  } catch (error) {
    console.error('[Auth] Error en GET /subscription:', error)
    return res.status(500).json({ success: false, ok: false, error: 'No se pudo leer la suscripción.' })
  }
}

export async function requestRethusTrial(req, res) {
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {}
    const result = await startRethusTrial({
      token: bearerToken(req),
      documentNumber: body.documentNumber,
      rethusNumber: body.rethusNumber,
    })
    if (!result.ok) {
      return res.status(result.status).json({ success: false, ok: false, error: result.error })
    }
    return res.json({
      success: true,
      ok: true,
      message: `Prueba gratuita de ${TRIAL_DAYS} días activada.`,
      user: result.user,
    })
  } catch (error) {
    console.error('[Auth] Error en POST /subscription/trial:', error)
    return res.status(500).json({ success: false, ok: false, error: 'No se pudo activar la prueba gratuita.' })
  }
}

export async function choosePaidPlan(req, res) {
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {}
    const result = await selectPaidPlan({
      token: bearerToken(req),
      planId: body.planId,
    })
    if (!result.ok) {
      return res.status(result.status).json({ success: false, ok: false, error: result.error })
    }
    return res.json({
      success: true,
      ok: true,
      message: 'Plan de suscripción activado.',
      user: result.user,
    })
  } catch (error) {
    console.error('[Auth] Error en POST /subscription/plan:', error)
    return res.status(500).json({ success: false, ok: false, error: 'No se pudo activar el plan.' })
  }
}
