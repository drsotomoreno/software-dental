/**
 * Aislamiento multi-tenant en IndexedDB.
 *
 * Cada sesión usa `DentalEMR_${userId}_${clinicaId}`. Al cambiar de cuenta/clínica
 * se vacían todas las tablas y se invalidan claves de storage globales/scoped.
 */
import {
  db,
  deleteAndResetDentalDatabase,
  ensureDentalDatabaseForAuth,
  resolveDentalEmrDbName,
  retireOrphanUuidDentalEmrDatabase,
} from '@/db/database'
import { getStoredApiAuth } from '@/services/apiAuthService'
import { getCurrentClinicId, withRemotePullLock } from '@/services/clinicalSyncState'
import { citasStorageKey, CITAS_STORAGE_KEY_LEGACY } from '@/utils/agendaStorage'
import {
  clinicKeyInScope,
  clinicSyncAliasIds,
  resolveClinicSyncId,
} from '../../shared/clinicalSyncScope.js'

const LAST_CLINIC_KEY = 'doctorSEO_lastClinicSyncId'
const LAST_DB_KEY = 'doctorSEO_lastDentalEmrDb'
const PULL_CACHE_DB = 'ClinicSyncPullCache'

/**
 * Época de sincronización cliente. Al incrementar, el navegador invalida la
 * caché de pull y fuerza un pull fresco. NUNCA borra pacientes/historias de
 * Dexie antes de un pull verificado (datos clínicos / legales).
 * Bump: 2026-11-14-v4 — epoch seguro (sin wipe previo) + matching por alias.
 */
export const SYNC_SCHEMA_VERSION = '2026-11-14-v4'
/** @deprecated alias de lectura; la clave canónica es MHD_SYNC_EPOCH_KEY */
const SYNC_SCHEMA_KEY = 'mihistoriadental.syncSchemaVersion'
const MHD_SYNC_EPOCH_KEY = 'mhd_sync_epoch'

/** Claves legacy o compartidas que no deben sobrevivir un switch de cuenta. */
const GLOBAL_LOCAL_STORAGE_KEYS = [
  CITAS_STORAGE_KEY_LEGACY,
  'citas_dental',
  'agenda-slot-notes-v1',
  'dental_emr_billing_modality',
  'dental_emr_payment_invoice_seq',
  'dental_emr_payment_invoice_prefix',
  'dental_emr_credit_note_seq',
  'dental_emr_credit_note_prefix',
  'dental_emr_backup_settings',
  'dental_emr_scheduled_passphrase',
  'doctorSEO_trial_voice_notes',
  'dental.diagnosticAidOpeners',
  'mihistoriadental.ripsDailyBatch',
] as const

const GLOBAL_SESSION_STORAGE_KEYS = ['mihistoriadental.ripsDailyBatch'] as const

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

/**
 * Alcance de la sesión (canónico + aliases UUID/email/superadmin-session).
 * Evita ocultar o purgar pacientes del maestro etiquetados con UUID legacy.
 */
export function getSessionClinicScope(clinicId = getCurrentClinicId()): {
  canonical: string
  aliases: string[]
} {
  try {
    const auth = getStoredApiAuth()
    if (auth?.user) {
      const scope = clinicSyncAliasIds(auth.user)
      if (scope.canonical) return scope
    }
  } catch {
    /* ignore */
  }
  const canonical = normalizeClinicKey(clinicId)
  return { canonical, aliases: canonical ? [canonical] : [] }
}

/** ¿El clinicId de la fila pertenece al cubo de la sesión (incl. aliases)? */
export function rowBelongsToClinicScope(
  rowClinicId?: string | null,
  clinicId = getCurrentClinicId(),
): boolean {
  const raw = String(rowClinicId ?? '').trim()
  if (!raw || !clinicId) return false
  const { canonical, aliases } = getSessionClinicScope(clinicId)
  if (!canonical) return clinicIdsMatch(raw, clinicId)
  return clinicKeyInScope(raw, canonical, aliases)
}

/** ¿El registro pertenece a la clínica de la sesión actual? */
export function belongsToCurrentClinic(
  row: { clinicId?: string | null } | null | undefined,
  clinicId = getCurrentClinicId(),
): boolean {
  if (!row || !clinicId) return false
  return rowBelongsToClinicScope(row.clinicId, clinicId)
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

function clearTenantWebStorage(): void {
  if (typeof window === 'undefined') return
  const auth = getStoredApiAuth()
  const userId = String(auth?.user?.id || '').trim()

  try {
    for (const key of GLOBAL_LOCAL_STORAGE_KEYS) {
      localStorage.removeItem(key)
    }
    if (userId) {
      localStorage.removeItem(citasStorageKey(userId))
      localStorage.removeItem(`citas_dental_${userId}`)
      localStorage.removeItem(`agenda-slot-notes-v1_${userId}`)
      localStorage.removeItem(`dental_emr_billing_modality_${userId}`)
    }
    const toRemove: string[] = []
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i)
      if (!key) continue
      if (
        key.startsWith('citas_dental_') ||
        key.startsWith('agenda-slot-notes-v1_') ||
        key.startsWith('dental_emr_billing_modality_')
      ) {
        toRemove.push(key)
      }
    }
    for (const key of toRemove) localStorage.removeItem(key)
  } catch {
    /* ignore */
  }

  try {
    for (const key of GLOBAL_SESSION_STORAGE_KEYS) {
      sessionStorage.removeItem(key)
    }
    if (userId) {
      sessionStorage.removeItem(`mihistoriadental.ripsDailyBatch_${userId}`)
    }
  } catch {
    /* ignore */
  }
}

/**
 * Vacía TODAS las tablas Dexie de la instancia activa + storage asociado.
 * Solo para cambio de cuenta / recuperación explícita — NUNCA en bump de época.
 */
export async function wipeLocalClinicalData(): Promise<void> {
  await withRemotePullLock(async () => {
    const clears = db.tables.map((table) => table.clear())
    await Promise.all(clears)
  })
  await clearPullCache()
  clearTenantWebStorage()
}

function readStoredSyncEpoch(): string {
  if (typeof window === 'undefined') return ''
  try {
    return String(
      localStorage.getItem(MHD_SYNC_EPOCH_KEY) ||
        localStorage.getItem(SYNC_SCHEMA_KEY) ||
        '',
    ).trim()
  } catch {
    return ''
  }
}

function clearSyncMarkersForFreshPull(): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem('lastSyncAt')
    localStorage.removeItem('doctorSEO_lastSyncAt')
    localStorage.removeItem('mihistoriadental.lastSyncAt')
    const toRemove: string[] = []
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i)
      if (!key) continue
      if (/lastSyncAt|LastSync|pullCache|clinicPull/i.test(key)) toRemove.push(key)
    }
    for (const key of toRemove) localStorage.removeItem(key)
  } catch {
    /* ignore */
  }
}

/**
 * Si la época cambió: invalida caché de pull y marca “necesita pull fresco”.
 * Conserva pacientes/historias/odontogramas en Dexie hasta commit tras pull OK.
 */
export async function ensureSyncSchemaEpoch(): Promise<{ upgraded: boolean }> {
  if (typeof window === 'undefined') return { upgraded: false }
  const stored = readStoredSyncEpoch()
  const current = String(SYNC_SCHEMA_VERSION)
  if (stored === current) return { upgraded: false }

  console.warn(
    '[Sync] Nueva mhd_sync_epoch — se conserva Dexie clínico; solo caché + pull fresco.',
    { stored: stored || '(none)', current },
  )
  await clearPullCache()
  clearSyncMarkersForFreshPull()
  // Época NO se escribe aquí: commitSyncSchemaEpoch() tras pull verificado.
  return { upgraded: true }
}

/** Confirma la época solo después de un pull/apply exitoso (datos legales intactos). */
export function commitSyncSchemaEpoch(): void {
  if (typeof window === 'undefined') return
  const current = String(SYNC_SCHEMA_VERSION)
  try {
    localStorage.setItem(MHD_SYNC_EPOCH_KEY, current)
    localStorage.setItem(SYNC_SCHEMA_KEY, current)
  } catch {
    /* ignore */
  }
}

export function isSyncSchemaEpochCurrent(): boolean {
  return readStoredSyncEpoch() === String(SYNC_SCHEMA_VERSION)
}

/**
 * Antes de pull/push: abre el cubo IndexedDB del tenant y limpia si cambió la clínica.
 */
export async function ensureClinicLocalIsolation(clinicId = getCurrentClinicId()): Promise<void> {
  const auth = getStoredApiAuth()
  const userId = auth?.user?.id || null
  const canonicalClinicId =
    resolveClinicSyncId(auth?.user) || clinicId || getCurrentClinicId()
  const nextDbName = resolveDentalEmrDbName(userId, canonicalClinicId)

  let previousClinic = ''
  let previousDb = ''
  try {
    previousClinic = String(localStorage.getItem(LAST_CLINIC_KEY) || '').trim()
    previousDb = String(localStorage.getItem(LAST_DB_KEY) || '').trim()
  } catch {
    previousClinic = ''
    previousDb = ''
  }

  const clinicChanged = Boolean(
    previousClinic && canonicalClinicId && !clinicIdsMatch(previousClinic, canonicalClinicId),
  )
  const dbChanged = Boolean(previousDb && previousDb !== nextDbName)

  if (clinicChanged || dbChanged) {
    console.warn(
      '[Tenant] Cambio de clínica/cuenta. Se abre la base de esta sesión y se conserva la anterior.',
      { previousClinic, clinicId: canonicalClinicId, previousDb, nextDbName },
    )
  }

  await ensureDentalDatabaseForAuth(userId, canonicalClinicId)
  await retireOrphanUuidDentalEmrDatabase(userId, canonicalClinicId)

  if (canonicalClinicId) {
    await purgeForeignClinicRecords(canonicalClinicId)
  }

  try {
    if (canonicalClinicId) localStorage.setItem(LAST_CLINIC_KEY, normalizeClinicKey(canonicalClinicId))
    localStorage.setItem(LAST_DB_KEY, nextDbName)
  } catch {
    /* ignore */
  }
}

/** Borra de Dexie filas ajenas al cubo de sesión; sana aliases → canónico. */
export async function purgeForeignClinicRecords(clinicId = getCurrentClinicId()): Promise<void> {
  if (!clinicId) return
  const canonical = normalizeClinicKey(clinicId)
  await withRemotePullLock(async () => {
    const patients = await db.patients.toArray()
    const keptPatientIds = new Set<string>()
    for (const row of patients) {
      if (row.id == null) continue
      if (!rowBelongsToClinicScope(row.clinicId, clinicId)) {
        await db.patients.delete(row.id)
        continue
      }
      // Alias legacy (UUID / email sin clinic:) → sellar canónico, no borrar.
      if (canonical && !clinicIdsMatch(row.clinicId, canonical)) {
        await db.patients.update(row.id, { clinicId: canonical })
      }
      keptPatientIds.add(String(row.id))
      if (row.syncId) keptPatientIds.add(String(row.syncId))
    }

    for (const row of await db.appointments.toArray()) {
      if (row.id == null) continue
      if (!rowBelongsToClinicScope(row.clinicId, clinicId)) {
        await db.appointments.delete(row.id)
        continue
      }
      if (canonical && row.clinicId && !clinicIdsMatch(row.clinicId, canonical)) {
        await db.appointments.update(row.id, { clinicId: canonical })
      }
    }

    for (const row of await db.clinicalRecords.toArray()) {
      if (row.id == null) continue
      const patientOk = keptPatientIds.has(String(row.patientId ?? ''))
      if (!rowBelongsToClinicScope(row.clinicId, clinicId) || !patientOk) {
        await db.clinicalRecords.delete(row.id)
        continue
      }
      if (canonical && row.clinicId && !clinicIdsMatch(row.clinicId, canonical)) {
        await db.clinicalRecords.update(row.id, { clinicId: canonical })
      }
    }

    for (const row of await db.odontograms.toArray()) {
      if (row.id == null) continue
      const patientOk = keptPatientIds.has(String(row.patientId ?? ''))
      if (!rowBelongsToClinicScope(row.clinicId, clinicId) || !patientOk) {
        await db.odontograms.delete(row.id)
        continue
      }
      if (canonical && row.clinicId && !clinicIdsMatch(row.clinicId, canonical)) {
        await db.odontograms.update(row.id, { clinicId: canonical })
      }
    }

    for (const row of await db.diagnosticAids.toArray()) {
      if (row.id == null) continue
      const patientOk = keptPatientIds.has(String(row.patientId ?? ''))
      if (!rowBelongsToClinicScope(row.clinicId, clinicId) || !patientOk) {
        await db.diagnosticAids.delete(row.id)
        continue
      }
      if (canonical && row.clinicId && !clinicIdsMatch(row.clinicId, canonical)) {
        await db.diagnosticAids.update(row.id, { clinicId: canonical })
      }
    }

    for (const row of await db.patientClinicalDrafts.toArray()) {
      if (!keptPatientIds.has(String(row.patientId ?? ''))) {
        await db.patientClinicalDrafts.delete(row.patientId)
      }
    }

    for (const row of await db.rips_submissions.toArray()) {
      if (!rowBelongsToClinicScope(row.clinicId, clinicId)) {
        await db.rips_submissions.delete(row.id)
      }
    }

    for (const row of await db.ripsTemporales.toArray()) {
      if (!rowBelongsToClinicScope(row.clinicId, clinicId)) {
        await db.ripsTemporales.delete(row.id)
      }
    }

    for (const row of await db.electronicInvoices.toArray()) {
      const invoiceClinic = (row as { clinicId?: string }).clinicId
      if (invoiceClinic && !rowBelongsToClinicScope(invoiceClinic, clinicId)) {
        await withBackupUnlockInvoiceDelete(row.id)
      }
    }

    for (const row of await db.rips_queue.toArray()) {
      const queueClinic = (row as { clinicId?: string }).clinicId
      if (queueClinic && !rowBelongsToClinicScope(queueClinic, clinicId)) {
        await db.rips_queue.delete(row.id!)
      }
    }
  })
}

async function withBackupUnlockInvoiceDelete(id: string): Promise<void> {
  const { withBackupRestoreUnlock } = await import('@/db/database')
  await withBackupRestoreUnlock(async () => {
    await db.electronicInvoices.delete(id)
  })
}

/**
 * Cierre de sesión médico-legal: NO borra IndexedDB.
 * La partición DentalEMR_${user}_${clinic} se reabre en el próximo login.
 * Solo limpia las marcas de última clínica/DB en storage de sesión.
 */
export async function clearClinicIsolationOnLogout(): Promise<void> {
  try {
    localStorage.removeItem(LAST_CLINIC_KEY)
    localStorage.removeItem(LAST_DB_KEY)
  } catch {
    /* ignore */
  }
}

export function readCachedPullKey(clinicId = getCurrentClinicId()): string {
  const key = normalizeClinicKey(clinicId)
  return key ? `pull:${key}` : 'latest'
}
