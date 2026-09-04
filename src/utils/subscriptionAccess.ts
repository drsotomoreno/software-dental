import { isApiSuperAdmin, type ApiSubscriptionUser } from '@/services/apiAuthService'

export function isSubscriptionCurrent(user?: ApiSubscriptionUser | null): boolean {
  if (!user) return false
  if (isApiSuperAdmin(user) || user.estado_pago === 'exento') return true
  if (user.estado_pago !== 'activo' && user.estado_pago !== 'prueba') return false
  if (!user.fecha_vencimiento) return user.estado_pago === 'activo'
  return new Date(user.fecha_vencimiento).getTime() > Date.now()
}

export function userNeedsWelcome(user?: ApiSubscriptionUser | null): boolean {
  if (!user) return false
  if (isApiSuperAdmin(user) || user.estado_pago === 'exento') return false
  return !isSubscriptionCurrent(user)
}

export function userHasTrialLimits(user?: ApiSubscriptionUser | null): boolean {
  if (!user || isApiSuperAdmin(user)) return false
  if (user.trialLimited === true) return isSubscriptionCurrent(user)
  return user.estado_pago === 'prueba' && isSubscriptionCurrent(user)
}
