import { db } from '@/db/database'
import { getStoredApiAuth } from '@/services/apiAuthService'
import {
  flushPendingClinicalDraft,
  getCurrentClinicId,
  setClinicalSyncDirtyListener,
  withRemotePullLock,
} from '@/services/clinicalSyncState'
import type { Appointment } from '@/types/appointment'
import type { ClinicalSyncRecord } from '@/types/clinicalSync'
import type { Patient } from '@/types/patient'
import { generateId } from '@/utils'
import { conservarFechaApertura } from '../../shared/patientOpenedAt.js'
import { preserveOmittedLocalFields } from '../../shared/clinicalSyncMerge.js'
import { renderCitas, syncCitasToLocalStorage } from '@/utils/agendaStorage'
import {
  applyClinicSnapshot,
  pushClinicSnapshotLocal,
  readCachedClinicPull,
} from '@/services/clinicSnapshotSync'

declare global {
  interface Window {
    __doctorSEOClinicPull?: import('@/types/clinicalSync').ClinicalSyncPullResponse
    __doctorSEOApplyClinicPull?: (payload: import('@/types/clinicalSync').ClinicalSyncPullResponse) => Promise<boolean>
    __doctorSEOForceClinicPull?: (
      token: string,
      user?: { clinicId?: string; id?: string; email?: string; documentNumber?: string } | null,
    ) => Promise<boolean>
  }
}

const POLL_MS = 2_000
const DIRTY_DEBOUNCE_MS = 200

const LOCAL_ONLY_KEYS = new Set(['id', 'pendingSync', 'lastSyncedAt'])

export const CLINICAL_SYNC_POLL_MS = POLL_MS

function stampOf(value: { updatedAt?: string; deletedAt?: string | null } | ClinicalSyncRecord): number {
  const deleted = Date.parse('deletedAt' in value ? String(value.deletedAt || '') : '') || 0
  const updated = Date.parse(String(value.updatedAt || '')) || 0
  return Math.max(deleted, updated)
}

function identityHeaders() {
  const auth = getStoredApiAuth()
  return {
    ...(auth?.token ? { Authorization: `Bearer ${auth.token}` } : {}),
    ...(auth?.user?.email ? { 'X-Client-Email': String(auth.user.email) } : {}),
    ...(auth?.user?.id ? { 'X-Client-User-Id': String(auth.user.id) } : {}),
    ...(auth?.user?.documentNumber
      ? { 'X-Client-Document': String(auth.user.documentNumber) }
      : {}),
  }
}

async function syncFetch(url: string, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...identityHeaders(),
      ...(init?.headers ?? {}),
    },
  })
  const payload = await response.json().catch(() => ({}))
  return { response, payload }
}

function toSyncPayload(entity: Patient | Appointment): Record<string, unknown> {
  const payload: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(entity)) {
    if (LOCAL_ONLY_KEYS.has(key)) continue
    payload[key] = value
  }
  return payload
}

function toSyncRecord(
  entity: Patient | Appointment,
  clinicId: string,
): ClinicalSyncRecord | null {
  const syncId = String(entity.syncId || '').trim()
  const recordClinicId = clinicId
  if (!syncId || !recordClinicId) return null
  return {
    syncId,
    clinicId: recordClinicId,
    updatedAt: entity.updatedAt,
    deletedAt: 'deletedAt' in entity ? entity.deletedAt || null : null,
    payload: toSyncPayload(entity),
  }
}

function applyPayload<T extends Patient | Appointment>(
  remote: ClinicalSyncRecord,
  extras: Partial<T> = {},
): T {
  const payload = { ...remote.payload }
  delete payload.id
  delete payload.pendingSync
  delete payload.lastSyncedAt
  return {
    ...(payload as unknown as T),
    syncId: remote.syncId,
    clinicId: remote.clinicId,
    updatedAt: remote.updatedAt,
    pendingSync: false,
    lastSyncedAt: new Date().toISOString(),
    ...extras,
  }
}

async function findLocalPatient(remote: ClinicalSyncRecord): Promise<Patient | undefined> {
  const { clinicIdsMatch } = await import('@/services/clinicLocalIsolation')
  const remoteClinicId = String(remote.clinicId || getCurrentClinicId() || '').trim()

  const bySync = await db.patients.where('syncId').equals(remote.syncId).first()
  if (bySync) {
    if (!remoteClinicId || !bySync.clinicId || clinicIdsMatch(bySync.clinicId, remoteClinicId)) {
      return bySync
    }
  }

  const documentNumber = String(remote.payload.documentNumber ?? '').trim()
  if (!documentNumber) return undefined

  // Merge solo si coincide la tupla (documentNumber, clinicaId).
  const candidates = await db.patients.where('documentNumber').equals(documentNumber).toArray()
  if (!remoteClinicId) return candidates[0]
  return candidates.find((patient) => clinicIdsMatch(patient.clinicId, remoteClinicId))
}

async function findLocalAppointment(remote: ClinicalSyncRecord): Promise<Appointment | undefined> {
  return db.appointments.where('syncId').equals(remote.syncId).first()
}

async function resolveLocalPatientId(remote: ClinicalSyncRecord): Promise<string | undefined> {
  const patientSyncId = String(remote.payload.patientSyncId ?? '').trim()
  if (patientSyncId) {
    const patient = await db.patients.where('syncId').equals(patientSyncId).first()
    if (patient?.id != null) return String(patient.id)
  }
  const fallback = remote.payload.patientId
  return fallback == null || fallback === '' ? undefined : String(fallback)
}

export function mergeShouldSkipLocal(local: { pendingSync?: boolean } | undefined): boolean {
  return local?.pendingSync === true
}

async function mergePatients(records: ClinicalSyncRecord[]): Promise<boolean> {
  let changed = false
  for (const remote of records) {
    const local = await findLocalPatient(remote)
    if (mergeShouldSkipLocal(local)) {
      if (local && local.syncId !== remote.syncId && local.id != null) {
        await db.patients.update(local.id, { syncId: remote.syncId })
        changed = true
      }
      continue
    }
    if (local) {
      if (stampOf(remote) <= stampOf(local)) continue
      if (local.id == null) continue
      let next = applyPayload<Patient>(remote)
      next = preserveOmittedLocalFields(
        local as unknown as Record<string, unknown>,
        next as unknown as Record<string, unknown>,
      ) as Patient
      delete next.id
      const apertura = conservarFechaApertura(local.createdAt, next.createdAt)
      if (apertura) next.createdAt = apertura
      else delete next.createdAt
      await db.patients.update(local.id, next)
      changed = true
      continue
    }
    const next = applyPayload<Patient>(remote)
    delete next.id
    if (!conservarFechaApertura(next.createdAt)) {
      next.createdAt = new Date().toISOString()
    }
    await db.patients.add(next)
    changed = true
  }
  return changed
}

async function mergeAppointments(records: ClinicalSyncRecord[]): Promise<boolean> {
  let changed = false
  for (const remote of records) {
    const local = await findLocalAppointment(remote)
    if (mergeShouldSkipLocal(local)) {
      if (local && local.syncId !== remote.syncId && local.id != null) {
        await db.appointments.update(local.id, { syncId: remote.syncId })
        changed = true
      }
      continue
    }
    const patientId = await resolveLocalPatientId(remote)
    const next = applyPayload<Appointment>(remote, {
      patientId,
      deletedAt: remote.deletedAt || undefined,
    })
    delete next.id
    if (local) {
      if (stampOf(remote) <= stampOf(local)) continue
      if (local.id == null) continue
      await db.appointments.update(local.id, next)
      changed = true
      continue
    }
    if (next.deletedAt) continue
    await db.appointments.add(next)
    changed = true
  }
  return changed
}

async function withPatientSyncId(row: Appointment): Promise<Appointment> {
  if (row.patientSyncId || !row.patientId) return row
  const patient =
    (await db.patients.get(row.patientId)) ||
    (/^\d+$/.test(String(row.patientId))
      ? await db.patients.get(Number(row.patientId))
      : undefined)
  if (!patient?.syncId) return row
  return { ...row, patientSyncId: patient.syncId }
}

/**
 * Completa syncId solo en registros YA de esta clínica.
 * NUNCA reasigna clinicId ajeno (fuga multi-tenant / Superadmin → clínica nueva).
 */
async function adoptLocalRecords(clinicId: string): Promise<void> {
  const { clinicIdsMatch } = await import('@/services/clinicLocalIsolation')
  await withRemotePullLock(async () => {
    const patients = await db.patients.toArray()
    for (const row of patients) {
      if (row.id == null) continue
      if (row.clinicId && !clinicIdsMatch(row.clinicId, clinicId)) continue
      const patch: Partial<Patient> = {}
      if (!row.syncId) patch.syncId = generateId()
      if (!row.clinicId) patch.clinicId = clinicId
      if (Object.keys(patch).length > 0) await db.patients.update(row.id, patch)
    }
    const appointments = await db.appointments.toArray()
    for (const row of appointments) {
      if (row.id == null) continue
      if (row.clinicId && !clinicIdsMatch(row.clinicId, clinicId)) continue
      const patch: Partial<Appointment> = {}
      if (!row.syncId) patch.syncId = generateId()
      if (!row.clinicId) patch.clinicId = clinicId
      if (Object.keys(patch).length > 0) await db.appointments.update(row.id, patch)
    }
  })
}

async function pushAllLocal(clinicId: string): Promise<{
  ok: boolean
  acceptedPatients: number
  rejected: number
}> {
  const { clinicIdsMatch, ensureClinicLocalIsolation } = await import(
    '@/services/clinicLocalIsolation'
  )
  await ensureClinicLocalIsolation(clinicId)
  await adoptLocalRecords(clinicId)
  const [patientsRaw, appointmentsRaw] = await Promise.all([
    db.patients.toArray(),
    db.appointments.toArray(),
  ])
  const patients = patientsRaw.filter(
    (row) => !row.clinicId || clinicIdsMatch(row.clinicId, clinicId),
  )
  const appointments = appointmentsRaw.filter(
    (row) => !row.clinicId || clinicIdsMatch(row.clinicId, clinicId),
  )

  const patientRecords = patients
    .map((row) => toSyncRecord({ ...row, clinicId }, clinicId))
    .filter((row): row is ClinicalSyncRecord => row != null)

  const appointmentRecords = (
    await Promise.all(appointments.map((row) => withPatientSyncId({ ...row, clinicId })))
  )
    .map((row) => toSyncRecord(row, clinicId))
    .filter((row): row is ClinicalSyncRecord => row != null)

  if (patientRecords.length === 0 && appointmentRecords.length === 0) {
    return { ok: true, acceptedPatients: 0, rejected: 0 }
  }

  const { response, payload } = await syncFetch('/api/sync/clinical', {
    method: 'POST',
    body: JSON.stringify({ patients: patientRecords, appointments: appointmentRecords }),
  })
  if (!response.ok) return { ok: false, acceptedPatients: 0, rejected: 0 }

  const acceptedPatientSyncIds = new Set(
    (Array.isArray(payload?.accepted?.patientSyncIds)
      ? payload.accepted.patientSyncIds
      : []
    ).map((id: unknown) => String(id)),
  )
  const acceptedAppointmentSyncIds = new Set(
    (Array.isArray(payload?.accepted?.appointmentSyncIds)
      ? payload.accepted.appointmentSyncIds
      : []
    ).map((id: unknown) => String(id)),
  )
  const acceptedPatients = Number(payload?.accepted?.patients) || 0
  const rejected = Number(payload?.accepted?.rejected) || 0
  // Solo marca synced lo que el servidor confirmó. Si no hay lista de ids
  // (API antigua), exige cero rechazos y al menos un aceptado.
  const legacySafe =
    acceptedPatientSyncIds.size === 0 &&
    acceptedAppointmentSyncIds.size === 0 &&
    rejected === 0 &&
    acceptedPatients >= patientRecords.length

  const now = new Date().toISOString()
  await withRemotePullLock(async () => {
    for (const row of patients) {
      if (row.id == null) continue
      const syncId = String(row.syncId || '')
      if (!legacySafe && (!syncId || !acceptedPatientSyncIds.has(syncId))) continue
      await db.patients.update(row.id, { pendingSync: false, lastSyncedAt: now, clinicId })
    }
    for (const row of appointments) {
      if (row.id == null) continue
      const syncId = String(row.syncId || '')
      if (!legacySafe && (!syncId || !acceptedAppointmentSyncIds.has(syncId))) continue
      await db.appointments.update(row.id, {
        pendingSync: false,
        lastSyncedAt: now,
        clinicId,
      })
    }
  })
  return { ok: true, acceptedPatients, rejected }
}

/** Aplica pacientes, citas, historias y blobs del snapshot a IndexedDB. */
export async function applyFullClinicPull(
  payload: {
    patients?: ClinicalSyncRecord[]
    appointments?: ClinicalSyncRecord[]
    clinicalRecords?: unknown
    odontograms?: unknown
    diagnosticAids?: unknown
    attachments?: unknown
    drafts?: unknown
    sync_queue?: unknown
  },
  options?: { hydrateBlobs?: boolean },
): Promise<boolean> {
  const patients = Array.isArray(payload.patients) ? payload.patients : []
  const appointments = Array.isArray(payload.appointments) ? payload.appointments : []
  await withRemotePullLock(async () => {
    await mergePatients(patients)
    await mergeAppointments(appointments)
  })
  const extraChanged = await applyClinicSnapshot(payload as import('@/types/clinicalSync').ClinicalSyncPullResponse, {
    hydrateBlobs: options?.hydrateBlobs !== false,
  })
  await syncCitasToLocalStorage()
  renderCitas()
  return extraChanged || patients.length > 0 || appointments.length > 0
}

async function pullAndMerge(includeBlobs = false): Promise<{ ok: boolean; patients: number }> {
  const { response, payload } = await syncFetch(`/api/sync/pull?full=${includeBlobs ? '1' : '0'}`)
  if (!response.ok) return { ok: false, patients: 0 }
  await applyFullClinicPull(payload, { hydrateBlobs: includeBlobs })
  const patients = Array.isArray(payload.patients)
    ? payload.patients.length
    : Number(payload.patientCount) || 0
  return { ok: true, patients }
}

/** Pull forzado al iniciar sesión: snapshot completo con archivos antes de renderizar. */
export async function pullCompleteClinicOnLogin(): Promise<boolean> {
  const auth = getStoredApiAuth()
  if (!auth?.token) return false
  try {
    const clinicId = getCurrentClinicId()
    const { ensureDentalDatabaseForAuth } = await import('@/db/database')
    // Misma resolución canónica que AuthContext / purge (nunca UUID crudo del maestro).
    await ensureDentalDatabaseForAuth(auth.user?.id, clinicId)
    if (clinicId) {
      const { ensureClinicLocalIsolation } = await import('@/services/clinicLocalIsolation')
      await ensureClinicLocalIsolation(clinicId)
    }

    const { clinicIdsMatch } = await import('@/services/clinicLocalIsolation')
    if (typeof window !== 'undefined' && typeof window.__doctorSEOForceClinicPull === 'function') {
      const forced = await window.__doctorSEOForceClinicPull(auth.token, auth.user)
      if (forced) {
        const cached = await readCachedClinicPull()
        if (
          cached &&
          clinicId &&
          cached.clinicId &&
          clinicIdsMatch(cached.clinicId, clinicId)
        ) {
          await applyFullClinicPull(cached)
        }
        return true
      }
    }
    const cached = await readCachedClinicPull()
    if (cached && clinicId && cached.clinicId && clinicIdsMatch(cached.clinicId, clinicId)) {
      await applyFullClinicPull(cached)
    }
    if (!clinicId) return false
    const merged = await pullAndMerge(true)
    await syncCitasToLocalStorage()
    renderCitas()
    return merged.ok
  } catch {
    return false
  }
}

if (typeof window !== 'undefined') {
  window.__doctorSEOApplyClinicPull = applyFullClinicPull
  window.dispatchEvent(new Event('doctorSEO-clinic-pull-applier-ready'))
}

let inFlight: Promise<boolean> | null = null
let queued = false
let dirtyTimer: number | null = null

async function performClinicalSyncCycle(): Promise<boolean> {
  const auth = getStoredApiAuth()
  const clinicId = getCurrentClinicId()
  if (!auth?.token || !clinicId) return false

  try {
    await flushPendingClinicalDraft().catch(() => undefined)
    await pushAllLocal(clinicId).catch(() => false)
    await pushClinicSnapshotLocal(clinicId).catch(() => false)
    const changed = await pullAndMerge(false).catch(() => ({ ok: false, patients: 0 }))
    await syncCitasToLocalStorage()
    renderCitas()
    return changed.ok
  } catch {
    return false
  }
}

/** Ciclo silencioso: sube TODO lo local y baja el snapshot completo de la clínica. */
export function runClinicalSyncCycle(): Promise<boolean> {
  if (inFlight) {
    queued = true
    return inFlight
  }
  inFlight = performClinicalSyncCycle().finally(() => {
    inFlight = null
    if (queued) {
      queued = false
      void runClinicalSyncCycle()
    }
  })
  return inFlight
}

export function scheduleClinicalSync(delayMs = DIRTY_DEBOUNCE_MS): void {
  if (typeof window === 'undefined') return
  if (dirtyTimer) window.clearTimeout(dirtyTimer)
  dirtyTimer = window.setTimeout(() => {
    dirtyTimer = null
    void runClinicalSyncCycle()
  }, delayMs) as unknown as number
}

setClinicalSyncDirtyListener(() => {
  scheduleClinicalSync()
})

export type ForzarSincronizacionResult = {
  ok: boolean
  /** Pacientes que el servidor tiene de esta clínica después del pull. */
  patients: number
  /** Pacientes que el servidor aceptó en esta subida. */
  acceptedPatients: number
  /** Fichas de este equipo que siguen sin acuse. */
  pending: number
  localPatients: number
  appointments: number
  clinicId?: string
  error?: string
}

/** Sube IndexedDB completo a /api/sync/clinical y baja el snapshot. Usar desde UI o consola. */
export async function forzarSincronizacionLocal(): Promise<ForzarSincronizacionResult> {
  const auth = getStoredApiAuth()
  const clinicId = getCurrentClinicId()
  if (!auth?.token || !clinicId) {
    return {
      ok: false,
      patients: 0,
      acceptedPatients: 0,
      pending: 0,
      localPatients: 0,
      appointments: 0,
      error: 'Inicie sesión para forzar la sincronización.',
    }
  }

  const { clinicIdsMatch } = await import('@/services/clinicLocalIsolation')
  const [patientRows, appointmentCount] = await Promise.all([
    db.patients.toArray(),
    db.appointments.count(),
  ])
  const ownPatients = patientRows.filter(
    (row) => !row.clinicId || clinicIdsMatch(row.clinicId, clinicId),
  )
  const pending = ownPatients.filter((row) => row.pendingSync === true || !row.lastSyncedAt).length

  try {
    const pushed = await pushAllLocal(clinicId)
    if (!pushed.ok) {
      return {
        ok: false,
        patients: 0,
        acceptedPatients: 0,
        pending,
        localPatients: ownPatients.length,
        appointments: appointmentCount,
        clinicId,
        error: 'El servidor rechazó el POST /api/sync/clinical.',
      }
    }
    await pushClinicSnapshotLocal(clinicId).catch(() => false)
    const pulled = await pullAndMerge(true)
    await syncCitasToLocalStorage()
    renderCitas()
    const stillPending = (await db.patients.toArray()).filter(
      (row) =>
        (!row.clinicId || clinicIdsMatch(row.clinicId, clinicId)) &&
        (row.pendingSync === true || !row.lastSyncedAt),
    ).length
    return {
      ok: pulled.ok,
      patients: pulled.patients,
      acceptedPatients: pushed.acceptedPatients,
      pending: stillPending,
      localPatients: ownPatients.length,
      appointments: appointmentCount,
      clinicId,
      error: pulled.ok ? undefined : 'La subida llegó, pero no se pudo volver a bajar el listado.',
    }
  } catch (error) {
    return {
      ok: false,
      patients: 0,
      acceptedPatients: 0,
      pending,
      localPatients: ownPatients.length,
      appointments: appointmentCount,
      clinicId,
      error: error instanceof Error ? error.message : 'No se pudo sincronizar.',
    }
  }
}
