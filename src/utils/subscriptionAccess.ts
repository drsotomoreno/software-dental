import type { ApiSubscriptionUser } from '@/services/apiAuthService'
import {
  clinicalAccessTier,
  type ClinicalAccessTier,
} from '../../shared/clinicalAccess.js'

export function accessTier(user?: ApiSubscriptionUser | null): ClinicalAccessTier {
  return clinicalAccessTier(user)
}

export function isSubscriptionCurrent(user?: ApiSubscriptionUser | null): boolean {
  return accessTier(user) !== 'none'
}

export function userNeedsWelcome(user?: ApiSubscriptionUser | null): boolean {
  if (!user) return false
  return accessTier(user) === 'none'
}

/** Destino post-login/registro: sin plan solo demo; con prueba o plan el consultorio. */
export function postAuthDestination(user?: ApiSubscriptionUser | null, fallback = '/app'): string {
  if (userNeedsWelcome(user)) return '/demo'
  return fallback
}

export function userHasTrialLimits(user?: ApiSubscriptionUser | null): boolean {
  return accessTier(user) === 'trial'
}
