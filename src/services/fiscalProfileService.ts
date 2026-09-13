import { db } from '@/db/database'
import type { UserProfile } from '@/types/user'
import {
  getBillingModalitySettings,
  saveBillingModalitySettings,
} from '@/services/billingModalityService'
import { updateOwnProfile } from '@/services/subscriptionService'
import {
  getStoredApiAuth,
  setStoredApiAuth,
  type ApiSubscriptionUser,
} from '@/services/apiAuthService'
import {
  isNoObligadoFev,
  normalizePerfilFiscal,
  type FiscalProfile,
} from '@/utils/fiscalProfile'

type PersistUser = Pick<
  UserProfile,
  | 'id'
  | 'firstName'
  | 'lastName'
  | 'legalName'
  | 'documentType'
  | 'documentNumber'
  | 'clinicName'
  | 'providerNit'
  | 'repsCode'
  | 'providerType'
  | 'rethusNumber'
>

function applyLocalSession(
  perfilFiscal: FiscalProfile,
  providerType: PersistUser['providerType'],
  applySessionUser?: (user: ApiSubscriptionUser) => void,
) {
  const stored = getStoredApiAuth()
  if (!stored?.user) return
  const nextUser: ApiSubscriptionUser = {
    ...stored.user,
    perfilFiscal,
    ...(providerType ? { providerType } : {}),
  }
  setStoredApiAuth(stored.token, nextUser)
  applySessionUser?.(nextUser)
}

export async function persistClinicPerfilFiscal(
  perfilFiscalInput: FiscalProfile,
  options?: {
    user?: PersistUser | null
    applySessionUser?: (user: ApiSubscriptionUser) => void
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const perfilFiscal = normalizePerfilFiscal(perfilFiscalInput)
  const noObligado = isNoObligadoFev(perfilFiscal)
  saveBillingModalitySettings({
    ...getBillingModalitySettings(),
    perfilFiscal,
  })

  const user = options?.user
  const providerType = noObligado
    ? 'profesional_independiente'
    : user?.providerType ?? getStoredApiAuth()?.user?.providerType

  applyLocalSession(perfilFiscal, providerType, options?.applySessionUser)

  if (user?.id) {
    try {
      const patch: Partial<UserProfile> = { perfilFiscal }
      if (providerType) patch.providerType = providerType
      await db.users.update(user.id, patch)
    } catch {
      /* IndexedDB puede no estar listo en el primer arranque */
    }
  }

  try {
    const remote = await updateOwnProfile({
      perfilFiscal,
      ...(providerType ? { providerType } : {}),
      clientEmail: getStoredApiAuth()?.user?.email,
      clientUserId: getStoredApiAuth()?.user?.id,
    })
    if (remote.ok) {
      const latestAuth = getStoredApiAuth()
      setStoredApiAuth(latestAuth?.token ?? `session-${remote.user.id}`, remote.user)
      options?.applySessionUser?.(remote.user)
    }
  } catch {
    /* El onboarding no exige NIT/REPS; el perfil queda en este equipo. */
  }

  return { ok: true }
}
