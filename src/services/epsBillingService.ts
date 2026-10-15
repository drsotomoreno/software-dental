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
import { isHabilitarFacturacionEps } from '@/utils/habilitarFacturacionEps'

type PersistUser = Pick<UserProfile, 'id' | 'clinicId'>

function applyLocalSession(
  habilitarFacturacionEps: boolean,
  applySessionUser?: (user: ApiSubscriptionUser) => void,
) {
  const stored = getStoredApiAuth()
  if (!stored?.user) return
  const nextUser: ApiSubscriptionUser = {
    ...stored.user,
    habilitarFacturacionEps,
  }
  setStoredApiAuth(stored.token, nextUser)
  applySessionUser?.(nextUser)
}

export async function persistHabilitarFacturacionEps(
  enabled: boolean,
  options?: {
    user?: PersistUser | null
    applySessionUser?: (user: ApiSubscriptionUser) => void
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const habilitarFacturacionEps = isHabilitarFacturacionEps(enabled)
  saveBillingModalitySettings({
    ...getBillingModalitySettings(),
    habilitarFacturacionEps,
  })
  applyLocalSession(habilitarFacturacionEps, options?.applySessionUser)

  const user = options?.user
  const clinicId = user?.clinicId || user?.id
  if (clinicId) {
    try {
      const members = await db.users.toArray()
      for (const member of members) {
        if (!member.id) continue
        if (String(member.clinicId || member.id) !== String(clinicId)) continue
        await db.users.update(member.id, { habilitarFacturacionEps })
      }
    } catch {
      /* IndexedDB puede no estar listo en el primer arranque */
    }
  }

  try {
    const remote = await updateOwnProfile({
      habilitarFacturacionEps,
      clientEmail: getStoredApiAuth()?.user?.email,
      clientUserId: getStoredApiAuth()?.user?.id,
    })
    if (remote.ok) {
      const latestAuth = getStoredApiAuth()
      const nextUser: ApiSubscriptionUser = {
        ...remote.user,
        habilitarFacturacionEps,
      }
      setStoredApiAuth(latestAuth?.token ?? `session-${remote.user.id}`, nextUser)
      options?.applySessionUser?.(nextUser)
    }
  } catch {
    /* El ajuste queda en este equipo si el servidor no responde. */
  }

  return { ok: true }
}
