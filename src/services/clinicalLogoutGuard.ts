/**
 * Cierre de sesión: intenta flush + sync best-effort (máx. 2s) sin bloquear el logout.
 * Tras el sync, AuthContext purga Dexie/IndexedDB + storage (PC de recepción multi-usuario).
 */
import { db } from '@/db/database'
import { isBrowserOnline } from '@/hooks/useOnlineStatus'
import { flushPendingClinicalDraft } from '@/services/clinicalSyncState'

export const LOGOUT_SYNC_TIMEOUT_MS = 2000

/** @deprecated Conservado por compatibilidad con tests/mensajes legacy; el logout ya no se bloquea. */
export const LOGOUT_BLOCKED_MESSAGE =
  'No se puede cerrar sesión todavía: hay cambios clínicos/presupuestales sin respaldar en la nube. Verifica tu conexión para evitar pérdida de datos.'

export type ClinicalLogoutGuardResult =
  | { ok: true; flushed: boolean; remaining: number; timedOut?: boolean }
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

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<{ value?: T; timedOut: boolean }> {
  return new Promise((resolve) => {
    let settled = false
    const timer = window.setTimeout(() => {
      if (settled) return
      settled = true
      resolve({ timedOut: true })
    }, ms)
    promise
      .then((value) => {
        if (settled) return
        settled = true
        window.clearTimeout(timer)
        resolve({ value, timedOut: false })
      })
      .catch(() => {
        if (settled) return
        settled = true
        window.clearTimeout(timer)
        resolve({ timedOut: false })
      })
  })
}

async function attemptLogoutSync(): Promise<void> {
  try {
    await flushPendingClinicalDraft()
  } catch (error) {
    console.error('[logout-guard] flush borrador falló:', error)
  }

  if (!isBrowserOnline()) return

  try {
    const { flushEmrV2Outbox } = await import('@/services/emrV2Client')
    await flushEmrV2Outbox()
  } catch (error) {
    console.error('[logout-guard] flush outbox v2 falló:', error)
  }

  try {
    const { forzarSincronizacionLocal } = await import('@/services/clinicalSyncService')
    await forzarSincronizacionLocal()
  } catch (error) {
    console.error('[logout-guard] sync forzado falló:', error)
  }
}

/**
 * Intenta flush + sync forzado con tope de 2s. Nunca bloquea el cierre de sesión.
 */
export async function guardClinicalLogout(): Promise<ClinicalLogoutGuardResult> {
  const raced = await withTimeout(attemptLogoutSync(), LOGOUT_SYNC_TIMEOUT_MS)
  if (raced.timedOut) {
    console.warn('[logout-guard] sync previo al logout superó el timeout; se continúa el cierre')
  }

  let remaining = 0
  try {
    remaining = await countPendingClinicalWork()
  } catch {
    remaining = 0
  }

  return { ok: true, flushed: !raced.timedOut, remaining, timedOut: raced.timedOut }
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
