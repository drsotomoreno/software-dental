/**
 * Middleware: paquetes WhatsApp solo para clínicas con suscripción paga activa.
 * Spec: subscription_status === 'active' && plan_type !== 'free_trial'
 */
import { hasActivePaidSubscription } from '../../shared/whatsappPackages.js'
import {
  isSuperAdminUser,
  resolveSubscriptionSession,
  sessionHintFromRequest,
} from '../services/subscriptionAuthStore.js'

function bearerToken(req) {
  const authHeader = req.headers.authorization ?? ''
  return authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null
}

/**
 * Resuelve la sesión completa (titular/billing) y la adjunta a req.whatsappSession.
 * No bloquea por sí solo: úsalo antes de requirePaidWhatsappSubscription.
 */
export async function attachWhatsappSession(req, res, next) {
  try {
    const session = await resolveSubscriptionSession(bearerToken(req), sessionHintFromRequest(req))
    if (!session?.user) {
      return res.status(401).json({
        success: false,
        ok: false,
        error: 'Sesión inválida o expirada.',
        code: 'WHATSAPP_SESSION_REQUIRED',
      })
    }
    req.whatsappSession = session
    req.authSession = session
    return next()
  } catch (error) {
    return res.status(401).json({
      success: false,
      ok: false,
      error: 'Sesión inválida o expirada.',
      code: error?.code || 'WHATSAPP_SESSION_INVALID',
    })
  }
}

/**
 * Bloquea free_trial / vencidos. Superadmin bypass.
 */
export function requirePaidWhatsappSubscription(req, res, next) {
  const user = req.whatsappSession?.user || req.authSession?.user || req.user
  if (!user) {
    return res.status(401).json({
      success: false,
      ok: false,
      error: 'Sesión inválida o expirada.',
      code: 'WHATSAPP_SESSION_REQUIRED',
    })
  }

  if (isSuperAdminUser(user) || user.is_superadmin === true) {
    return next()
  }

  if (!hasActivePaidSubscription(user)) {
    return res.status(402).json({
      success: false,
      ok: false,
      error:
        'Los paquetes de WhatsApp y Chatbot están disponibles solo con suscripción paga activa. La prueba gratuita no incluye recargas.',
      code: 'WHATSAPP_PAID_SUBSCRIPTION_REQUIRED',
      requiresPaidSubscription: true,
    })
  }

  return next()
}

export default {
  attachWhatsappSession,
  requirePaidWhatsappSubscription,
}
