import {
  getStoredApiAuth,
  isApiSuperAdmin,
  restoreMasterApiSession,
  setStoredApiAuth,
  SUPERADMIN_EMAIL,
  type ApiSubscriptionUser,
} from '@/services/apiAuthService'
import { PAID_PLANS, TRIAL_DAYS } from '../../shared/subscriptionPlans.js'

export { PAID_PLANS, TRIAL_DAYS }

function identityHeaders(auth = getStoredApiAuth()) {
  return {
    ...(auth?.token ? { Authorization: `Bearer ${auth.token}` } : {}),
    ...(auth?.user?.email ? { 'X-Client-Email': String(auth.user.email) } : {}),
    ...(auth?.user?.id ? { 'X-Client-User-Id': String(auth.user.id) } : {}),
  }
}

async function authFetch(url: string, init?: RequestInit) {
  const auth = getStoredApiAuth()
  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...identityHeaders(auth),
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

function isSessionLostError(message: string) {
  return /sesi[oó]n inv[aá]lida|expirada/i.test(message)
}

async function putOwnProfile(patch: Record<string, unknown>) {
  const auth = getStoredApiAuth()
  return authFetch('/api/profile', {
    method: 'PUT',
    body: JSON.stringify({
      ...patch,
      clientUserId: auth?.user?.id || patch.clientUserId,
      clientEmail: auth?.user?.email || patch.clientEmail,
    }),
  })
}

function shouldRestoreMasterSession(email?: string) {
  const stored = getStoredApiAuth()
  const value = String(email || stored?.user?.email || '')
    .trim()
    .toLowerCase()
  return value === SUPERADMIN_EMAIL || isApiSuperAdmin(stored?.user)
}

export async function updateOwnProfile(patch: Record<string, unknown>) {
  const email = String(patch.clientEmail || getStoredApiAuth()?.user?.email || '')
  if (shouldRestoreMasterSession(email)) {
    await restoreMasterApiSession(email)
  }
  let { response, payload } = await putOwnProfile(patch)
  if (response.status === 401 || isSessionLostError(String(payload.error ?? ''))) {
    await restoreMasterApiSession(email)
    ;({ response, payload } = await putOwnProfile(patch))
  }
  if (response.status === 401 || isSessionLostError(String(payload.error ?? ''))) {
    return { ok: false as const, error: 'SESSION_UNAVAILABLE' }
  }
  if (!response.ok) {
    return { ok: false as const, error: String(payload.error || 'No se pudo guardar el perfil.') }
  }
  persistUser(payload.user)
  return { ok: true as const, user: payload.user as ApiSubscriptionUser }
}

export async function changeOwnPassword(input: { currentPassword: string; newPassword: string }) {
  const { response, payload } = await authFetch('/api/profile/password', {
    method: 'PUT',
    body: JSON.stringify(input),
  })
  if (!response.ok) {
    return { ok: false as const, error: String(payload.error || 'No se pudo actualizar la contraseña.') }
  }
  return { ok: true as const }
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
