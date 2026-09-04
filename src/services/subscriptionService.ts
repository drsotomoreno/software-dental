import { getStoredApiAuth, setStoredApiAuth, type ApiSubscriptionUser } from '@/services/apiAuthService'
import { PAID_PLANS, TRIAL_DAYS } from '../../shared/subscriptionPlans.js'

export { PAID_PLANS, TRIAL_DAYS }

async function authFetch(url: string, init?: RequestInit) {
  const auth = getStoredApiAuth()
  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(auth?.token ? { Authorization: `Bearer ${auth.token}` } : {}),
      ...(init?.headers ?? {}),
    },
  })
  const payload = await response.json().catch(() => ({}))
  return { response, payload }
}

function persistUser(user: ApiSubscriptionUser) {
  const auth = getStoredApiAuth()
  if (auth?.token) setStoredApiAuth(auth.token, user)
}

export async function fetchSubscriptionStatus() {
  const { response, payload } = await authFetch('/api/subscription')
  if (!response.ok) {
    return { ok: false as const, error: String(payload.error || 'No se pudo leer la suscripción.') }
  }
  if (payload.user) persistUser(payload.user)
  return {
    ok: true as const,
    user: payload.user as ApiSubscriptionUser,
    requiresSubscription: payload.requiresSubscription === true,
    plans: (payload.plans as typeof PAID_PLANS) || PAID_PLANS,
  }
}

export async function activateRethusTrial(documentNumber: string, rethusNumber: string) {
  const { response, payload } = await authFetch('/api/subscription/trial', {
    method: 'POST',
    body: JSON.stringify({ documentNumber, rethusNumber }),
  })
  if (!response.ok) {
    return { ok: false as const, error: String(payload.error || 'No se pudo activar la prueba.') }
  }
  persistUser(payload.user)
  return { ok: true as const, user: payload.user as ApiSubscriptionUser, message: payload.message as string }
}

export async function updateOwnProfile(patch: Record<string, unknown>) {
  const { response, payload } = await authFetch('/api/profile', {
    method: 'PUT',
    body: JSON.stringify(patch),
  })
  if (!response.ok) {
    return { ok: false as const, error: String(payload.error || 'No se pudo guardar el perfil.') }
  }
  persistUser(payload.user)
  return { ok: true as const, user: payload.user as ApiSubscriptionUser }
}

export async function activatePaidPlan(planId: string) {
  const { response, payload } = await authFetch('/api/subscription/plan', {
    method: 'POST',
    body: JSON.stringify({ planId }),
  })
  if (!response.ok) {
    return { ok: false as const, error: String(payload.error || 'No se pudo activar el plan.') }
  }
  persistUser(payload.user)
  return { ok: true as const, user: payload.user as ApiSubscriptionUser, message: payload.message as string }
}
