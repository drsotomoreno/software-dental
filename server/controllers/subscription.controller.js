import {
  purchaseTitularMessagePackage,
  purchaseTitularPlan,
  readTitularProducts,
  resolveSubscriptionSession,
  selectPaidPlan,
  sessionHintFromRequest,
  startRethusTrial,
} from '../services/subscriptionAuthStore.js'
import { PAID_PLANS, TRIAL_DAYS, TTC_MESSAGE_PACKAGES } from '../../shared/subscriptionPlans.js'

function bearerToken(req) {
  const authHeader = req.headers.authorization ?? ''
  return authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null
}

export async function getSubscriptionStatus(req, res) {
  try {
    const session = await resolveSubscriptionSession(bearerToken(req), sessionHintFromRequest(req))
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
      hint: sessionHintFromRequest(req),
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
      hint: sessionHintFromRequest(req),
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

function titularPayload(result) {
  return {
    success: true,
    ok: true,
    titular: result.titular,
    plan: result.plan,
    packages: result.packages,
    canPurchase: result.canPurchase !== false,
    user: result.user,
    plans: PAID_PLANS,
    messageCatalog: TTC_MESSAGE_PACKAGES,
  }
}

export async function getTitularProducts(req, res) {
  try {
    const result = await readTitularProducts({
      token: bearerToken(req),
      hint: sessionHintFromRequest(req),
    })
    if (!result.ok) {
      return res.status(result.status).json({ success: false, ok: false, error: result.error })
    }
    return res.json(titularPayload(result))
  } catch (error) {
    console.error('[Auth] Error en GET /subscription/account:', error)
    return res.status(500).json({ success: false, ok: false, error: 'No se pudo leer la suscripción del titular.' })
  }
}

export async function buyTitularPlan(req, res) {
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {}
    const result = await purchaseTitularPlan({
      token: bearerToken(req),
      planId: body.planId,
      hint: sessionHintFromRequest(req),
    })
    if (!result.ok) {
      return res.status(result.status).json({ success: false, ok: false, error: result.error })
    }
    return res.json({ ...titularPayload(result), message: result.message })
  } catch (error) {
    console.error('[Auth] Error en POST /subscription/account/plan:', error)
    return res.status(500).json({ success: false, ok: false, error: 'No se pudo adquirir el plan.' })
  }
}

export async function buyTitularMessagePackage(req, res) {
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {}
    const result = await purchaseTitularMessagePackage({
      token: bearerToken(req),
      packageId: body.packageId,
      hint: sessionHintFromRequest(req),
    })
    if (!result.ok) {
      return res.status(result.status).json({ success: false, ok: false, error: result.error })
    }
    return res.json({ ...titularPayload(result), message: result.message })
  } catch (error) {
    console.error('[Auth] Error en POST /subscription/account/package:', error)
    return res.status(500).json({ success: false, ok: false, error: 'No se pudo adquirir el paquete.' })
  }
}
