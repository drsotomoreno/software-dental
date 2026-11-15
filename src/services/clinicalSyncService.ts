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

/** Antes 2s: martillaba clinical-sync.json (~160MB) y OOMeaba EC2 → 502 en Drive. */
const POLL_MS = 60_000
const DIRTY_DEBOUNCE_MS = 2_500
/** Cada fetch de sync: 12s. Evita inFlight colgado y UI congelada. */
export const CLINICAL_SYNC_FETCH_TIMEOUT_MS = 12_000
/** Login / rehidratación: payload completo (~100 pacientes) puede superar 12s. */
const CLINICAL_SYNC_LOGIN_FETCH_TIMEOUT_MS = 60_000
const CLINICAL_SYNC_CYCLE_TIMEOUT_MS = 36_000
const CLINICAL_SYNC_LOGIN_CYCLE_TIMEOUT_MS = 90_000

/** Pausas (p. ej. subida Drive): no disparar /clinical ni /push. */
const clinicalSyncPauseReasons = new Set<string>()
let dirtyTimer: number | null = null

export function pauseClinicalSync(reason = 'manual'): void {
  clinicalSyncPauseReasons.add(String(reason || 'manual'))
  if (typeof window !== 'undefined' && dirtyTimer) {
    window.clearTimeout(dirtyTimer)
    dirtyTimer = null
  }
}

export function resumeClinicalSync(reason = 'manual'): void {
  clinicalSyncPauseReasons.delete(String(reason || 'manual'))
}

export function isClinicalSyncPaused(): boolean {
  return clinicalSyncPauseReasons.size > 0
}

const LOCAL_ONLY_KEYS = new Set(['id', 'pendingSync', 'lastSyncedAt'])
const HEAVY_BINARY_KEYS = new Set([
  'dataUrl',
  'dataBase64',
  'base64',
  'fileData',
  'arrayBuffer',
  'blob',
  'data',
  'buffer',
  'bytes',
])

const MAX_INLINE_BINARY_CHARS = 50 * 1024

function stripHeavyBinaryFields(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map((row) => stripHeavyBinaryFields(row))
  const out: Record<string, unknown> = {}
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (HEAVY_BINARY_KEYS.has(key) || LOCAL_ONLY_KEYS.has(key)) continue
    if (
      typeof entry === 'string' &&
      entry.length > MAX_INLINE_BINARY_CHARS &&
      (/^data:/i.test(entry) || /^[A-Za-z0-9+/=\s]{256,}/.test(entry.slice(0, 80)))
    ) {
      continue
    }
    out[key] = entry && typeof entry === 'object' ? stripHeavyBinaryFields(entry) : entry
  }
  return out
}

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

async function syncFetch(
  url: string,
  init?: RequestInit & { timeoutMs?: number },
) {
  const { timeoutMs, ...fetchInit } = init ?? {}
  const controller = new AbortController()
  const timer = globalThis.setTimeout(
    () => controller.abort(),
    typeof timeoutMs === 'number' && timeoutMs > 0 ? timeoutMs : CLINICAL_SYNC_FETCH_TIMEOUT_MS,
  )
  const parentSignal = fetchInit.signal
  const onParentAbort = () => controller.abort()
  if (parentSignal) {
    if (parentSignal.aborted) controller.abort()
    else parentSignal.addEventListener('abort', onParentAbort, { once: true })
  }
  try {
    const response = await fetch(url, {
      ...fetchInit,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...identityHeaders(),
        ...(fetchInit.headers ?? {}),
      },
    })
    const payload = await response.json().catch(() => ({}))
    return { response, payload }
  } finally {
    globalThis.clearTimeout(timer)
    parentSignal?.removeEventListener('abort', onParentAbort)
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = globalThis.setTimeout(() => {
      reject(new Error(`${label} superó ${Math.round(ms / 1000)}s`))
    }, ms)
    promise.then(
      (value) => {
        globalThis.clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        globalThis.clearTimeout(timer)
        reject(error)
      },
    )
  })
}

function toSyncPayload(entity: Patient | Appointment): Record<string, unknown> {
  const payload: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(entity)) {
    if (LOCAL_ONLY_KEYS.has(key) || HEAVY_BINARY_KEYS.has(key)) continue
    payload[key] = value
  }
  return stripHeavyBinaryFields(payload) as Record<string, unknown>
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
  // Flags de listado viven en record.payload; se copian explícitamente al row Dexie.
  const clinicalFlags =
    'valuationOnly' in payload || 'phase' in payload || 'treatmentCompleted' in payload
      ? {
          valuationOnly: payload.valuationOnly as Patient['valuationOnly'],
          phase: payload.phase as Patient['phase'],
          treatmentCompleted: payload.treatmentCompleted as Patient['treatmentCompleted'],
        }
      : {}
  const sessionClinicId = getCurrentClinicId()
  // Sellar canónico de sesión al aplicar pull (evita purge por UUID/email legacy).
  const clinicId = sessionClinicId || String(remote.clinicId || '').trim()
  return {
    ...(payload as unknown as T),
    ...clinicalFlags,
    syncId: remote.syncId,
    clinicId,
    updatedAt: remote.updatedAt,
    pendingSync: false,
    lastSyncedAt: new Date().toISOString(),
    ...extras,
  }
}

async function findLocalPatient(remote: ClinicalSyncRecord): Promise<Patient | undefined> {
  const { rowBelongsToClinicScope } = await import('@/services/clinicLocalIsolation')
  const sessionClinicId = getCurrentClinicId()
  const remoteClinicId = String(remote.clinicId || sessionClinicId || '').trim()

  const bySync = await db.patients.where('syncId').equals(remote.syncId).first()
  if (bySync) {
    // Mismo syncId en el cubo de sesión (canónico o alias UUID/email).
    if (
      !bySync.clinicId ||
      rowBelongsToClinicScope(bySync.clinicId, sessionClinicId || remoteClinicId)
    ) {
      return bySync
    }
  }

  const documentNumber = String(remote.payload.documentNumber ?? '').trim()
  if (!documentNumber) return undefined

  // Merge solo si el documento pertenece al cubo de la sesión (aliases incluidos).
  const candidates = await db.patients.where('documentNumber').equals(documentNumber).toArray()
  const scopeId = sessionClinicId || remoteClinicId
  if (!scopeId) return candidates[0]
  return candidates.find((patient) => rowBelongsToClinicScope(patient.clinicId, scopeId))
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
  const { clinicIdsMatch, rowBelongsToClinicScope, normalizeClinicKey } = await import(
    '@/services/clinicLocalIsolation'
  )
  const canonical = normalizeClinicKey(clinicId)
  await withRemotePullLock(async () => {
    const patients = await db.patients.toArray()
    for (const row of patients) {
      if (row.id == null) continue
      // Conservar aliases del mismo cubo; solo saltar clínicas ajenas.
      if (row.clinicId && !rowBelongsToClinicScope(row.clinicId, clinicId)) continue
      const patch: Partial<Patient> = {}
      if (!row.syncId) patch.syncId = generateId()
      if (!row.clinicId || (canonical && !clinicIdsMatch(row.clinicId, canonical))) {
        patch.clinicId = canonical || clinicId
      }
      if (Object.keys(patch).length > 0) await db.patients.update(row.id, patch)
    }
    const appointments = await db.appointments.toArray()
    for (const row of appointments) {
      if (row.id == null) continue
      if (row.clinicId && !rowBelongsToClinicScope(row.clinicId, clinicId)) continue
      const patch: Partial<Appointment> = {}
      if (!row.syncId) patch.syncId = generateId()
      if (!row.clinicId || (canonical && !clinicIdsMatch(row.clinicId, canonical))) {
        patch.clinicId = canonical || clinicId
      }
      if (Object.keys(patch).length > 0) await db.appointments.update(row.id, patch)
    }
  })
}

async function pushAllLocal(clinicId: string): Promise<{
  ok: boolean
  acceptedPatients: number
  rejected: number
}> {
  const { rowBelongsToClinicScope, ensureClinicLocalIsolation } = await import(
    '@/services/clinicLocalIsolation'
  )
  await ensureClinicLocalIsolation(clinicId)
  await adoptLocalRecords(clinicId)
  const [patientsRaw, appointmentsRaw] = await Promise.all([
    db.patients.toArray(),
    db.appointments.toArray(),
  ])
  const patients = patientsRaw.filter(
    (row) => !row.clinicId || rowBelongsToClinicScope(row.clinicId, clinicId),
  )
  const appointments = appointmentsRaw.filter(
    (row) => !row.clinicId || rowBelongsToClinicScope(row.clinicId, clinicId),
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
    body: JSON.stringify(
      stripHeavyBinaryFields({
        patients: patientRecords,
        appointments: appointmentRecords,
      }),
    ),
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

/**
 * Pull full=0. Incluye pacientes, citas y metadatos livianos de exámenes
 * (sin base64). Sirve para rehidratar la sección 5 cuando IndexedDB está vacío.
 */
export async function pullSlimClinicMetadata(): Promise<boolean> {
  const result = await pullAndMerge(false)
  return result.ok
}

async function pullAndMerge(
  includeBlobs = false,
  options?: { timeoutMs?: number },
): Promise<{ ok: boolean; patients: number; error?: string; code?: string }> {
  const { response, payload } = await syncFetch(
    `/api/sync/pull?full=${includeBlobs ? '1' : '0'}`,
    options?.timeoutMs ? { timeoutMs: options.timeoutMs } : undefined,
  )
  if (!response.ok) {
    return {
      ok: false,
      patients: 0,
      error: String(payload?.error || `HTTP ${response.status}`),
      code: payload?.code ? String(payload.code) : undefined,
    }
  }
  await applyFullClinicPull(payload, { hydrateBlobs: includeBlobs })
  const patients = Array.isArray(payload.patients)
    ? payload.patients.length
    : Number(payload.patientCount) || 0
  return { ok: true, patients }
}

/**
 * El pull global ya no incluye drafts (OOM). Al abrir un paciente valorado
 * pedimos solo su borrador y lo fusionamos en IndexedDB.
 */
export async function pullPatientDraftOnDemand(patientSyncId: string): Promise<boolean> {
  const syncId = String(patientSyncId || '').trim()
  if (!syncId) return false
  const auth = getStoredApiAuth()
  if (!auth?.token) return false
  const { response, payload } = await syncFetch(
    `/api/sync/draft/${encodeURIComponent(syncId)}`,
    { timeoutMs: 45_000 },
  )
  if (!response.ok || !payload?.draft) {
    console.warn('[Sync] pullPatientDraftOnDemand failed', {
      syncId,
      status: response.status,
      error: payload?.error,
      code: payload?.code,
    })
    return false
  }
  await applyClinicSnapshot(
    {
      clinicId: String(payload.clinicId || auth.clinicId || ''),
      drafts: [payload.draft],
    } as import('@/types/clinicalSync').ClinicalSyncPullResponse,
    { hydrateBlobs: false },
  )
  return true
}

/**
 * Tras login/pull slim: rehidrata valuationDraft de valorados que aún no lo tienen
 * en Dexie. Evita ficha vacía la primera vez que se abre Pacientes Valorados.
 */
export async function prefetchMissingValuationDrafts(options?: {
  limit?: number
  concurrency?: number
}): Promise<number> {
  const limit = Math.max(1, options?.limit ?? 40)
  const concurrency = Math.max(1, Math.min(options?.concurrency ?? 2, 3))
  const auth = getStoredApiAuth()
  if (!auth?.token) return 0

  const { isValuatedOnlyPatient } = await import('@/types/patient')
  const { getPatientClinicalDraft, pickLivingDraftForm } = await import(
    '@/utils/patientClinicalDraft'
  )
  const { clinicalFormHasContent } = await import('../../shared/clinicalRecordGuard.js')
  const { belongsToCurrentClinic } = await import('@/services/clinicLocalIsolation')
  const clinicId = getCurrentClinicId()

  const patients = await db.patients.toArray()
  const missing: string[] = []
  for (const patient of patients) {
    if (missing.length >= limit) break
    if (!isValuatedOnlyPatient(patient)) continue
    if (clinicId && !belongsToCurrentClinic(patient, clinicId)) continue
    const syncId = String(patient.syncId || '').trim()
    if (!syncId || patient.id == null) continue
    try {
      const draft = await getPatientClinicalDraft(String(patient.id))
      const living = pickLivingDraftForm(draft?.clinicalDraft, draft?.valuationDraft)
      if (clinicalFormHasContent(living)) continue
      missing.push(syncId)
    } catch {
      missing.push(syncId)
    }
  }

  let recovered = 0
  for (let i = 0; i < missing.length; i += concurrency) {
    const chunk = missing.slice(i, i + concurrency)
    const results = await Promise.all(
      chunk.map((syncId) => pullPatientDraftOnDemand(syncId).catch(() => false)),
    )
    recovered += results.filter(Boolean).length
  }
  if (recovered > 0) {
    console.info('[Sync] Prefetch valuationDraft recuperó', recovered, 'valorados')
  }
  return recovered
}

/**
 * Pull forzado al iniciar sesión.
 * Médico-legal: NUNCA vacía Dexie antes del pull; si el pull falla, conserva
 * los pacientes locales y no confirma la época de schema.
 */
export async function pullCompleteClinicOnLogin(): Promise<boolean> {
  const auth = getStoredApiAuth()
  if (!auth?.token) return false
  try {
    return await withTimeout(
      (async () => {
        const clinicId = getCurrentClinicId()
        const { ensureDentalDatabaseForAuth } = await import('@/db/database')
        // Misma resolución canónica que AuthContext / purge (nunca UUID crudo del maestro).
        await ensureDentalDatabaseForAuth(auth.user?.id, clinicId)
        const {
          ensureClinicLocalIsolation,
          ensureSyncSchemaEpoch,
          commitSyncSchemaEpoch,
          clinicIdsMatch,
          rowBelongsToClinicScope,
        } = await import('@/services/clinicLocalIsolation')
        // Bump SYNC_SCHEMA_VERSION → invalida caché (conserva Dexie) → pull fresco.
        const { upgraded } = await ensureSyncSchemaEpoch()
        if (clinicId) {
          await ensureClinicLocalIsolation(clinicId)
        }

        if (!upgraded) {
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
              commitSyncSchemaEpoch()
              return true
            }
          }
          const cached = await readCachedClinicPull()
          if (cached && clinicId && cached.clinicId && clinicIdsMatch(cached.clinicId, clinicId)) {
            await applyFullClinicPull(cached)
          }
        }
        if (!clinicId) return false

        const { recordPullSuccess, recordPullFailure } = await import(
          '@/services/clinicalSyncHealth'
        )

        // Primero metadata (rápido); luego blobs si hay red.
        let merged = await pullAndMerge(false, {
          timeoutMs: CLINICAL_SYNC_LOGIN_FETCH_TIMEOUT_MS,
        })
        if (merged.ok && merged.patients > 0) {
          commitSyncSchemaEpoch()
          recordPullSuccess(clinicId, merged.patients)
          // Historias/odontogramas en segundo plano (sin drafts pesados).
          void pullAndMerge(true, { timeoutMs: CLINICAL_SYNC_LOGIN_FETCH_TIMEOUT_MS }).catch(
            () => undefined,
          )
        } else if (merged.ok) {
          // Pull OK pero 0 pacientes: intentar full por si el compacto falló.
          merged = await pullAndMerge(true, {
            timeoutMs: CLINICAL_SYNC_LOGIN_FETCH_TIMEOUT_MS,
          })
          if (merged.ok) {
            commitSyncSchemaEpoch()
            recordPullSuccess(clinicId, merged.patients)
          }
        }

        await syncCitasToLocalStorage()
        renderCitas()

        if (merged.ok) {
          if (merged.patients === 0) recordPullSuccess(clinicId, 0)
          // Segundo plano: drafts de valoración (el pull slim no los trae).
          void prefetchMissingValuationDrafts().catch(() => undefined)
          return true
        }

        // Pull falló: conservar datos locales si existen (offline / 502).
        const localCount = await db.patients
          .filter((row) => rowBelongsToClinicScope(row.clinicId, clinicId))
          .count()
        recordPullFailure(clinicId, merged.error, merged.code)
        if (localCount > 0) {
          console.warn(
            '[Sync] Pull al login falló; se conservan pacientes locales (datos clínicos).',
            { localCount, clinicId },
          )
          void prefetchMissingValuationDrafts().catch(() => undefined)
          return true
        }
        return false
      })(),
      CLINICAL_SYNC_LOGIN_CYCLE_TIMEOUT_MS,
      'Pull clínico al login',
    )
  } catch (error) {
    // Timeout/red: no destruir datos locales.
    try {
      const clinicId = getCurrentClinicId()
      const { recordPullFailure } = await import('@/services/clinicalSyncHealth')
      recordPullFailure(
        clinicId,
        error instanceof Error ? error.message : 'Pull clínico falló',
      )
      const { rowBelongsToClinicScope } = await import('@/services/clinicLocalIsolation')
      const localCount = clinicId
        ? await db.patients.filter((row) => rowBelongsToClinicScope(row.clinicId, clinicId)).count()
        : await db.patients.count()
      if (localCount > 0) return true
    } catch {
      /* ignore */
    }
    return false
  }
}

if (typeof window !== 'undefined') {
  window.__doctorSEOApplyClinicPull = applyFullClinicPull
  window.dispatchEvent(new Event('doctorSEO-clinic-pull-applier-ready'))
}

let inFlight: Promise<boolean> | null = null
let queued = false

async function performClinicalSyncCycle(): Promise<boolean> {
  const auth = getStoredApiAuth()
  const clinicId = getCurrentClinicId()
  if (!auth?.token || !clinicId) return false

  const run = async () => {
    await flushPendingClinicalDraft().catch(() => undefined)
    // Secuencial: nunca /clinical y /push en paralelo (t3.micro).
    await pushAllLocal(clinicId).catch(() => false)
    await pushClinicSnapshotLocal(clinicId).catch(() => false)
    const changed = await pullAndMerge(false).catch(() => ({ ok: false, patients: 0 }))
    await syncCitasToLocalStorage()
    renderCitas()
    return changed.ok
  }

  try {
    return await withTimeout(run(), CLINICAL_SYNC_CYCLE_TIMEOUT_MS, 'Ciclo de sync clínico')
  } catch {
    return false
  }
}

/** Ciclo silencioso: un solo vuelo; coalesces ráfagas dirty tras Drive. */
export function runClinicalSyncCycle(): Promise<boolean> {
  if (isClinicalSyncPaused()) return Promise.resolve(false)
  if (inFlight) {
    queued = true
    return inFlight
  }
  const cycle = performClinicalSyncCycle()
  inFlight = cycle.finally(() => {
    // Siempre libera el lock, incluso tras timeout/abort.
    inFlight = null
    if (queued) {
      queued = false
      if (!isClinicalSyncPaused()) void runClinicalSyncCycle()
      else queued = false
    }
  })
  return inFlight
}

export function scheduleClinicalSync(delayMs = DIRTY_DEBOUNCE_MS): void {
  if (typeof window === 'undefined') return
  if (isClinicalSyncPaused()) return
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

  const { rowBelongsToClinicScope } = await import('@/services/clinicLocalIsolation')
  const [patientRows, appointmentCount] = await Promise.all([
    db.patients.toArray(),
    db.appointments.count(),
  ])
  const ownPatients = patientRows.filter(
    (row) => !row.clinicId || rowBelongsToClinicScope(row.clinicId, clinicId),
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
    // Preferir slim (full=0): evita OOM; luego blobs en segundo plano.
    let pulled = await pullAndMerge(false)
    if (pulled.ok && pulled.patients === 0) {
      pulled = await pullAndMerge(true)
    } else if (pulled.ok) {
      void pullAndMerge(true).catch(() => undefined)
    }
    await syncCitasToLocalStorage()
    renderCitas()
    const { recordPullSuccess, recordPullFailure } = await import('@/services/clinicalSyncHealth')
    if (pulled.ok) {
      recordPullSuccess(clinicId, pulled.patients)
    } else {
      recordPullFailure(clinicId, pulled.error, pulled.code)
    }
    const stillPending = (await db.patients.toArray()).filter(
      (row) =>
        (!row.clinicId || rowBelongsToClinicScope(row.clinicId, clinicId)) &&
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
    const { recordPullFailure } = await import('@/services/clinicalSyncHealth')
    recordPullFailure(
      clinicId,
      error instanceof Error ? error.message : 'No se pudo sincronizar.',
    )
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
