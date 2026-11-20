/**
 * Guardia de cierre de sesión: no permite logout si hay borradores clínicos
 * o outbox EMR v2 sin respaldar en el servidor.
 */
import { db } from '@/db/database'
import { isBrowserOnline } from '@/hooks/useOnlineStatus'
import { flushPendingClinicalDraft } from '@/services/clinicalSyncState'

export const LOGOUT_BLOCKED_MESSAGE =
  'No se puede cerrar sesión todavía: hay cambios clínicos/presupuestales sin respaldar en la nube. Verifica tu conexión para evitar pérdida de datos.'

export type ClinicalLogoutGuardResult =
  | { ok: true; flushed: boolean; remaining: number }
  | { ok: false; reason: string; remaining: number }

async function countPendingClinicalWork(): Promise<number> {
  let pending = 0
  try {
    const drafts = await db.patientClinicalDrafts
      .filter((row) => {
        const status = String(row.syncStatus || '').toLowerCase()
        return status === 'pending' || status === 'error'
      })
      .count()
    pending += drafts
  } catch {
    /* Dexie puede estar bloqueado; asumir pendientes para no perder datos */
    pending += 1
  }
  try {
    const outbox = await db.emrV2Outbox
      .where('status')
      .anyOf(['pending', 'in_flight', 'conflict', 'error'])
      .count()
    pending += outbox
  } catch {
    pending += 1
  }
  return pending
}

/**
 * Intenta flush + sync forzado. Bloquea el logout si queda trabajo pendiente
 * o si no hay red y hay cola local.
 */
export async function guardClinicalLogout(): Promise<ClinicalLogoutGuardResult> {
  const online = isBrowserOnline()

  try {
    await flushPendingClinicalDraft()
  } catch (error) {
    console.error('[logout-guard] flush borrador falló:', error)
  }

  if (online) {
    try {
      const { flushEmrV2Outbox } = await import('@/services/emrV2Client')
      await flushEmrV2Outbox()
    } catch (error) {
      console.error('[logout-guard] flush outbox v2 falló:', error)
    }
    try {
      const { forzarSincronizacionLocal } = await import('@/services/clinicalSyncService')
      const sync = await forzarSincronizacionLocal()
      if (!sync.ok) {
        const remaining = await countPendingClinicalWork()
        if (remaining > 0) {
          return { ok: false, reason: LOGOUT_BLOCKED_MESSAGE, remaining }
        }
      }
    } catch (error) {
      console.error('[logout-guard] sync forzado falló:', error)
      const remaining = await countPendingClinicalWork()
      if (remaining > 0) {
        return { ok: false, reason: LOGOUT_BLOCKED_MESSAGE, remaining }
      }
    }
  }

  const remaining = await countPendingClinicalWork()
  if (remaining > 0) {
    return { ok: false, reason: LOGOUT_BLOCKED_MESSAGE, remaining }
  }

  return { ok: true, flushed: true, remaining: 0 }
}

/** Invalida marcas de pull para forzar network-first en el próximo login (sin borrar Dexie clínico). */
export async function invalidateClinicPullCacheOnLogout(): Promise<void> {
  try {
    const { clearClinicIsolationOnLogout } = await import('@/services/clinicLocalIsolation')
    await clearClinicIsolationOnLogout()
  } catch {
    /* no bloquear logout */
  }
  try {
    sessionStorage.removeItem('mhd_clinical_sync_health')
  } catch {
    /* private mode */
  }
}
