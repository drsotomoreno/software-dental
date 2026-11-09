/**
 * Aislamiento multi-tenant en IndexedDB.
 *
 * Bug crítico corregido: al iniciar sesión, `adoptLocalRecords` reasignaba
 * TODOS los pacientes locales (p. ej. del Superadmin o seed demo) a la clínica
 * nueva. Un registro fresco veía historias ajenas.
 */
import { db } from '@/db/database'
import { getCurrentClinicId, withRemotePullLock } from '@/services/clinicalSyncState'
import { CITAS_STORAGE_KEY } from '@/utils/agendaStorage'

const LAST_CLINIC_KEY = 'doctorSEO_lastClinicSyncId'
const PULL_CACHE_DB = 'ClinicSyncPullCache'
const PULL_CACHE_STORE = 'snapshots'

export function normalizeClinicKey(value?: string | null): string {
  const raw = String(value ?? '').trim()
  if (!raw) return ''
  return raw.startsWith('clinic:') ? raw : `clinic:${raw}`
}

export function clinicIdsMatch(a?: string | null, b?: string | null): boolean {
  const left = normalizeClinicKey(a)
  const right = normalizeClinicKey(b)
  return Boolean(left && right && left === right)
}

/** ¿El registro pertenece a la clínica de la sesión actual? */
export function belongsToCurrentClinic(
  row: { clinicId?: string | null } | null | undefined,
  clinicId = getCurrentClinicId(),
): boolean {
  if (!row || !clinicId) return false
  return clinicIdsMatch(row.clinicId, clinicId)
}

async function clearPullCache(): Promise<void> {
  if (typeof window === 'undefined') return
  try {
    delete (window as Window & { __doctorSEOClinicPull?: unknown }).__doctorSEOClinicPull
  } catch {
    /* ignore */
  }
  await new Promise<void>((resolve) => {
    try {
      const req = indexedDB.deleteDatabase(PULL_CACHE_DB)
      req.onsuccess = () => resolve()
      req.onerror = () => resolve()
      req.onblocked = () => resolve()
    } catch {
      resolve()
    }
  })
}

/** Vacía datos clínicos locales (no borra users/credenciales del dispositivo). */
export async function wipeLocalClinicalData(): Promise<void> {
  await withRemotePullLock(async () => {
    const clears: Array<Promise<unknown>> = [
      db.patients.clear(),
      db.appointments.clear(),
      db.clinicalRecords.clear(),
      db.odontograms.clear(),
      db.diagnosticAids.clear(),
      db.diagnosticAidBlobs.clear(),
      db.patientClinicalDrafts.clear(),
      db.syncQueue.clear(),
      db.rips_submissions.clear(),
    ]
    if (db.rips_queue) clears.push(db.rips_queue.clear())
    if (db.pacientes) clears.push(db.pacientes.clear())
    if (db.historias_clinicas) clears.push(db.historias_clinicas.clear())
    if (db.sync_queue) clears.push(db.sync_queue.clear())
    await Promise.all(clears)
  })
  await clearPullCache()
  try {
    localStorage.removeItem(CITAS_STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

/**
 * Antes de pull/push: si cambió la clínica de sesión, limpia IndexedDB.
 * También elimina registros ajenos que hayan quedado en el dispositivo.
 */
export async function ensureClinicLocalIsolation(clinicId = getCurrentClinicId()): Promise<void> {
  if (!clinicId) return

  let previous = ''
  try {
    previous = String(localStorage.getItem(LAST_CLINIC_KEY) || '').trim()
  } catch {
    previous = ''
  }

  if (previous && !clinicIdsMatch(previous, clinicId)) {
    console.warn(
      '[Tenant] Cambio de clínica en este navegador; se limpia IndexedDB local.',
      previous,
      '→',
      clinicId,
    )
    await wipeLocalClinicalData()
  } else {
    await purgeForeignClinicRecords(clinicId)
  }

  try {
    localStorage.setItem(LAST_CLINIC_KEY, normalizeClinicKey(clinicId))
  } catch {
    /* ignore */
  }
}

async function deleteIfForeign(
  table: { delete: (key: string | number) => Promise<unknown> },
  id: string | number | undefined | null,
  rowClinicId: string | null | undefined,
  clinicId: string,
): Promise<void> {
  if (id == null) return
  // Sin clinicId = huérfano de otro tenant (p. ej. Superadmin legacy). No conservar.
  if (!clinicIdsMatch(rowClinicId, clinicId)) {
    await table.delete(id)
  }
}

/** Borra de Dexie filas cuyo clinicId no coincide con la sesión. */
export async function purgeForeignClinicRecords(clinicId = getCurrentClinicId()): Promise<void> {
  if (!clinicId) return
  await withRemotePullLock(async () => {
    const patients = await db.patients.toArray()
    const keptPatientIds = new Set<string>()
    for (const row of patients) {
      if (row.id == null) continue
      if (!clinicIdsMatch(row.clinicId, clinicId)) {
        await db.patients.delete(row.id)
        continue
      }
      keptPatientIds.add(String(row.id))
      if (row.syncId) keptPatientIds.add(String(row.syncId))
    }

    const appointments = await db.appointments.toArray()
    for (const row of appointments) {
      await deleteIfForeign(db.appointments, row.id, row.clinicId, clinicId)
    }

    const records = await db.clinicalRecords.toArray()
    for (const row of records) {
      if (row.id == null) continue
      const patientOk = keptPatientIds.has(String(row.patientId ?? ''))
      if (!clinicIdsMatch(row.clinicId, clinicId) || !patientOk) {
        await db.clinicalRecords.delete(row.id)
      }
    }

    const odontograms = await db.odontograms.toArray()
    for (const row of odontograms) {
      if (row.id == null) continue
      const patientOk = keptPatientIds.has(String(row.patientId ?? ''))
      if (!clinicIdsMatch(row.clinicId, clinicId) || !patientOk) {
        await db.odontograms.delete(row.id)
      }
    }

    const aids = await db.diagnosticAids.toArray()
    for (const row of aids) {
      if (row.id == null) continue
      const patientOk = keptPatientIds.has(String(row.patientId ?? ''))
      if (!clinicIdsMatch(row.clinicId, clinicId) || !patientOk) {
        await db.diagnosticAids.delete(row.id)
      }
    }

    const drafts = await db.patientClinicalDrafts.toArray()
    for (const row of drafts) {
      if (!keptPatientIds.has(String(row.patientId ?? ''))) {
        await db.patientClinicalDrafts.delete(row.patientId)
      }
    }

    const submissions = await db.rips_submissions.toArray()
    for (const row of submissions) {
      if (!clinicIdsMatch(row.clinicId, clinicId)) {
        await db.rips_submissions.delete(row.id)
      }
    }
  })
}

export async function clearClinicIsolationOnLogout(): Promise<void> {
  await wipeLocalClinicalData()
  try {
    localStorage.removeItem(LAST_CLINIC_KEY)
  } catch {
    /* ignore */
  }
}

export function readCachedPullKey(clinicId = getCurrentClinicId()): string {
  const key = normalizeClinicKey(clinicId)
  return key ? `pull:${key}` : 'latest'
}
