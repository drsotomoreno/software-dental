import { db } from '@/db/database'
import { getStoredApiAuth } from '@/services/apiAuthService'
import {
  getCurrentClinicId,
  setClinicalSyncDirtyListener,
  withRemotePullLock,
} from '@/services/clinicalSyncState'
import type { Appointment } from '@/types/appointment'
import type { ClinicalSyncRecord } from '@/types/clinicalSync'
import type { Patient } from '@/types/patient'
import { generateId } from '@/utils'
import { renderCitas, syncCitasToLocalStorage } from '@/utils/agendaStorage'
import {
  applyClinicSnapshot,
  pushClinicSnapshotLocal,
  readCachedClinicPull,
} from '@/services/clinicSnapshotSync'

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
  const bySync = await db.patients.where('syncId').equals(remote.syncId).first()
  if (bySync) return bySync
  const documentNumber = String(remote.payload.documentNumber ?? '').trim()
  if (!documentNumber) return undefined
  return db.patients.where('documentNumber').equals(documentNumber).first()
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
      const next = applyPayload<Patient>(remote)
      delete next.id
      await db.patients.update(local.id, next)
      changed = true
      continue
    }
    const next = applyPayload<Patient>(remote)
    delete next.id
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

/** Asigna syncId/clinicId a lo local sin marcarlo pending (el snapshot sube todo). */
async function adoptLocalRecords(clinicId: string): Promise<void> {
  await withRemotePullLock(async () => {
    const patients = await db.patients.toArray()
    for (const row of patients) {
      if (row.id == null) continue
      const patch: Partial<Patient> = {}
      if (!row.syncId) patch.syncId = generateId()
      if (row.clinicId !== clinicId) patch.clinicId = clinicId
      if (Object.keys(patch).length > 0) await db.patients.update(row.id, patch)
    }
    const appointments = await db.appointments.toArray()
    for (const row of appointments) {
      if (row.id == null) continue
      const patch: Partial<Appointment> = {}
      if (!row.syncId) patch.syncId = generateId()
      if (row.clinicId !== clinicId) patch.clinicId = clinicId
      if (Object.keys(patch).length > 0) await db.appointments.update(row.id, patch)
    }
  })
}

async function pushAllLocal(clinicId: string): Promise<boolean> {
  await adoptLocalRecords(clinicId)
  const [patients, appointments] = await Promise.all([db.patients.toArray(), db.appointments.toArray()])

  const patientRecords = patients
    .map((row) => toSyncRecord({ ...row, clinicId }, clinicId))
    .filter((row): row is ClinicalSyncRecord => row != null)

  const appointmentRecords = (
    await Promise.all(appointments.map((row) => withPatientSyncId({ ...row, clinicId })))
  )
    .map((row) => toSyncRecord(row, clinicId))
    .filter((row): row is ClinicalSyncRecord => row != null)

  if (patientRecords.length === 0 && appointmentRecords.length === 0) return true

  const { response } = await syncFetch('/api/sync/clinical', {
    method: 'POST',
    body: JSON.stringify({ patients: patientRecords, appointments: appointmentRecords }),
  })
  if (!response.ok) return false

  const now = new Date().toISOString()
  await withRemotePullLock(async () => {
    for (const row of patients) {
      if (row.id == null) continue
      await db.patients.update(row.id, { pendingSync: false, lastSyncedAt: now, clinicId })
    }
    for (const row of appointments) {
      if (row.id == null) continue
      await db.appointments.update(row.id, {
        pendingSync: false,
        lastSyncedAt: now,
        clinicId,
      })
    }
  })
  return true
}

async function pullAndMerge(includeBlobs = false): Promise<boolean> {
  const { response, payload } = await syncFetch(`/api/sync/pull?full=${includeBlobs ? '1' : '0'}`)
  if (!response.ok) return false

  const patients = Array.isArray(payload.patients) ? (payload.patients as ClinicalSyncRecord[]) : []
  const appointments = Array.isArray(payload.appointments)
    ? (payload.appointments as ClinicalSyncRecord[])
    : []

  let changed = false
  await withRemotePullLock(async () => {
    const patientsChanged = await mergePatients(patients)
    const appointmentsChanged = await mergeAppointments(appointments)
    changed = patientsChanged || appointmentsChanged
  })
  const extraChanged = await applyClinicSnapshot(payload)
  return changed || extraChanged
}

let inFlight: Promise<boolean> | null = null
let queued = false
let dirtyTimer: number | null = null

async function performClinicalSyncCycle(): Promise<boolean> {
  const auth = getStoredApiAuth()
  const clinicId = getCurrentClinicId()
  if (!auth?.token || !clinicId) return false

  try {
    await pushAllLocal(clinicId).catch(() => false)
    await pushClinicSnapshotLocal(clinicId).catch(() => false)
    const changed = await pullAndMerge(false).catch(() => false)
    await syncCitasToLocalStorage()
    renderCitas()
    return Boolean(changed)
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
  patients: number
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
      appointments: 0,
      error: 'Inicie sesión para forzar la sincronización.',
    }
  }

  const [patientCount, appointmentCount] = await Promise.all([
    db.patients.count(),
    db.appointments.count(),
  ])

  try {
    const pushed = await pushAllLocal(clinicId)
    if (!pushed) {
      return {
        ok: false,
        patients: patientCount,
        appointments: appointmentCount,
        clinicId,
        error: 'El servidor rechazó el POST /api/sync/clinical.',
      }
    }
    await pullAndMerge(true)
    await syncCitasToLocalStorage()
    renderCitas()
    return { ok: true, patients: patientCount, appointments: appointmentCount, clinicId }
  } catch (error) {
    return {
      ok: false,
      patients: patientCount,
      appointments: appointmentCount,
      clinicId,
      error: error instanceof Error ? error.message : 'No se pudo sincronizar.',
    }
  }
}

/** Pull forzado al iniciar sesión: snapshot completo con archivos antes de renderizar. */
export async function pullCompleteClinicOnLogin(): Promise<boolean> {
  const auth = getStoredApiAuth()
  const clinicId = getCurrentClinicId()
  if (!auth?.token || !clinicId) return false
  try {
    const cached = await readCachedClinicPull()
    if (cached) {
      const patients = Array.isArray(cached.patients) ? cached.patients : []
      const appointments = Array.isArray(cached.appointments) ? cached.appointments : []
      await withRemotePullLock(async () => {
        await mergePatients(patients)
        await mergeAppointments(appointments)
      })
      await applyClinicSnapshot(cached)
      await syncCitasToLocalStorage()
      renderCitas()
      return true
    }
    const merged = await pullAndMerge(true)
    await syncCitasToLocalStorage()
    renderCitas()
    return merged
  } catch {
    return false
  }
}
