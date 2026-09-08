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
import { renderCitas, syncCitasToLocalStorage } from '@/utils/agendaStorage'

const PULL_SINCE_PREFIX = 'doctorSEO_clinical_sync_since:'
const POLL_MS = 10_000
const DIRTY_DEBOUNCE_MS = 400

const LOCAL_ONLY_KEYS = new Set(['id', 'pendingSync', 'lastSyncedAt'])

export const CLINICAL_SYNC_POLL_MS = POLL_MS

function stampOf(value: { updatedAt?: string; deletedAt?: string | null } | ClinicalSyncRecord): number {
  const deleted = Date.parse('deletedAt' in value ? String(value.deletedAt || '') : '') || 0
  const updated = Date.parse(String(value.updatedAt || '')) || 0
  return Math.max(deleted, updated)
}

function sinceStorageKey(clinicId: string): string {
  return `${PULL_SINCE_PREFIX}${clinicId}`
}

function readSince(clinicId: string): string {
  if (typeof localStorage === 'undefined') return ''
  return localStorage.getItem(sinceStorageKey(clinicId)) || ''
}

function writeSince(clinicId: string, serverTime: string): void {
  if (typeof localStorage === 'undefined' || !serverTime) return
  localStorage.setItem(sinceStorageKey(clinicId), serverTime)
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
  const recordClinicId = String(entity.clinicId || clinicId || '').trim()
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
      if (stampOf(remote) < stampOf(local)) continue
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
      if (stampOf(remote) < stampOf(local)) continue
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

async function pushDirty(clinicId: string): Promise<boolean> {
  const [patients, appointments] = await Promise.all([
    db.patients.filter((row) => row.pendingSync === true).toArray(),
    db.appointments.filter((row) => row.pendingSync === true).toArray(),
  ])

  const patientRecords = patients
    .filter((row) => Boolean(String(row.clinicId || '').trim()))
    .map((row) => toSyncRecord(row, clinicId))
    .filter((row): row is ClinicalSyncRecord => row != null)

  const appointmentRecords = (
    await Promise.all(
      appointments
        .filter((row) => Boolean(String(row.clinicId || '').trim()))
        .map((row) => withPatientSyncId(row)),
    )
  )
    .map((row) => toSyncRecord(row, clinicId))
    .filter((row): row is ClinicalSyncRecord => row != null)

  if (patientRecords.length === 0 && appointmentRecords.length === 0) return false

  const { response } = await syncFetch('/api/sync/clinical', {
    method: 'POST',
    body: JSON.stringify({ patients: patientRecords, appointments: appointmentRecords }),
  })
  if (!response.ok) return false

  const now = new Date().toISOString()
  await withRemotePullLock(async () => {
    for (const row of patients) {
      if (row.id == null || !patientRecords.some((item) => item.syncId === row.syncId)) continue
      await db.patients.update(row.id, { pendingSync: false, lastSyncedAt: now, clinicId: row.clinicId || clinicId })
    }
    for (const row of appointments) {
      if (row.id == null || !appointmentRecords.some((item) => item.syncId === row.syncId)) continue
      await db.appointments.update(row.id, {
        pendingSync: false,
        lastSyncedAt: now,
        clinicId: row.clinicId || clinicId,
      })
    }
  })
  return true
}

async function pullAndMerge(clinicId: string): Promise<boolean> {
  const since = readSince(clinicId)
  const query = since ? `?since=${encodeURIComponent(since)}` : ''
  const { response, payload } = await syncFetch(`/api/sync/clinical${query}`)
  if (!response.ok) return false

  const patients = Array.isArray(payload.patients) ? (payload.patients as ClinicalSyncRecord[]) : []
  const appointments = Array.isArray(payload.appointments)
    ? (payload.appointments as ClinicalSyncRecord[])
    : []
  const serverTime = String(payload.serverTime || new Date().toISOString())

  let changed = false
  await withRemotePullLock(async () => {
    const patientsChanged = await mergePatients(patients)
    const appointmentsChanged = await mergeAppointments(appointments)
    changed = patientsChanged || appointmentsChanged
  })

  writeSince(clinicId, serverTime)
  return changed
}

let inFlight: Promise<boolean> | null = null
let dirtyTimer: number | null = null

async function performClinicalSyncCycle(): Promise<boolean> {
  const auth = getStoredApiAuth()
  const clinicId = getCurrentClinicId()
  if (!auth?.token || !clinicId) return false

  try {
    await pushDirty(clinicId)
    const changed = await pullAndMerge(clinicId)
    if (changed) {
      await syncCitasToLocalStorage()
      renderCitas()
    }
    return changed
  } catch {
    return false
  }
}

/** Ciclo silencioso push + pull. No lanza; respeta un mutex para no solapar. */
export function runClinicalSyncCycle(): Promise<boolean> {
  if (inFlight) return inFlight
  inFlight = performClinicalSyncCycle().finally(() => {
    inFlight = null
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
