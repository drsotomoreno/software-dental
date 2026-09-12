import { db } from '@/db/database'
import { getStoredApiAuth } from '@/services/apiAuthService'
import {
  getCurrentClinicId,
  withRemotePullLock,
} from '@/services/clinicalSyncState'
import { saveDiagnosticAidBlobFromBuffer } from '@/services/diagnosticAidBlobStore'
import {
  enqueueDiagnosticAidForSync,
  listPendingSyncQueue,
  markSyncQueueSynced,
  resolvePatientSyncId,
} from '@/services/syncQueueService'
import type { ClinicalRecord } from '@/types/clinicalRecord'
import type { ClinicalSyncPullResponse, ClinicalSyncRecord } from '@/types/clinicalSync'
import type { DiagnosticAid } from '@/types/diagnosticAid'
import type { OdontogramData } from '@/types/odontogram'
import type { PatientClinicalDraft } from '@/types/patientClinicalDraft'
import type { SyncQueueAttachment } from '@/types/syncQueue'
import { arrayBufferToBase64, base64ToArrayBuffer } from '@/utils/base64Binary'
import { generateId } from '@/utils/crypto'
import { mimeTypeForDiagnosticFile } from '@/utils/diagnosticAidWebClassification'

const LOCAL_ONLY_KEYS = new Set(['id', 'pendingSync', 'lastSyncedAt'])
const PULL_CACHE_DB = 'ClinicSyncPullCache'
const PULL_CACHE_STORE = 'snapshots'

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

function toSyncPayload(entity: Record<string, unknown>): Record<string, unknown> {
  const payload: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(entity)) {
    if (LOCAL_ONLY_KEYS.has(key) || key === 'data' || key === 'dataBase64') continue
    payload[key] = value
  }
  return payload
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function recordsOf(value: unknown): ClinicalSyncRecord[] {
  if (!Array.isArray(value)) return []
  return value.filter((row): row is ClinicalSyncRecord => Boolean(row && typeof row === 'object'))
}

function payloadOf(remote: ClinicalSyncRecord): Record<string, unknown> {
  return { ...asRecord(remote.payload) }
}

async function resolveLocalPatientId(payload: Record<string, unknown>): Promise<string | undefined> {
  const patientSyncId = String(payload.patientSyncId ?? '').trim()
  if (patientSyncId) {
    const patient = await db.patients.where('syncId').equals(patientSyncId).first()
    if (patient?.id != null) return String(patient.id)
  }
  const fallback = payload.patientId
  return fallback == null || fallback === '' ? undefined : String(fallback)
}

async function withPatientSyncId<T extends { patientId?: string; patientSyncId?: string }>(
  row: T,
): Promise<T> {
  if (row.patientSyncId || !row.patientId) return row
  const patientSyncId = await resolvePatientSyncId(String(row.patientId))
  return patientSyncId ? { ...row, patientSyncId } : row
}

function toEntityRecord(
  entity: Record<string, unknown>,
  clinicId: string,
  syncId: string,
): ClinicalSyncRecord {
  return {
    syncId,
    clinicId,
    updatedAt: String(entity.updatedAt || entity.createdAt || new Date().toISOString()),
    deletedAt: (entity.deletedAt as string | null | undefined) || null,
    payload: toSyncPayload({ ...entity, clinicId, syncId }),
  }
}

async function mergeBySyncId<T extends { id?: number | string; syncId?: string; updatedAt?: string }>(
  loadAll: () => Promise<T[]>,
  addRow: (row: T) => Promise<unknown>,
  updateRow: (id: string | number, row: Partial<T>) => Promise<unknown>,
  remotes: ClinicalSyncRecord[],
  mapRow: (payload: Record<string, unknown>, remote: ClinicalSyncRecord) => Promise<T | null>,
): Promise<boolean> {
  let changed = false
  const locals = await loadAll()
  const bySync = new Map(
    locals.filter((row) => row.syncId).map((row) => [String(row.syncId), row]),
  )
  for (const remote of remotes) {
    const next = await mapRow(payloadOf(remote), remote)
    if (!next) continue
    const local = bySync.get(remote.syncId)
    if (local?.id != null) {
      const localStamp = Date.parse(String(local.updatedAt || '')) || 0
      const remoteStamp = Date.parse(String(remote.updatedAt || '')) || 0
      if (remoteStamp < localStamp) continue
      const patch = { ...next }
      delete patch.id
      await updateRow(local.id, patch)
      changed = true
      continue
    }
    const withId = { ...next }
    delete withId.id
    await addRow(withId)
    changed = true
  }
  return changed
}

async function mergeClinicalRecords(records: ClinicalSyncRecord[]): Promise<boolean> {
  return mergeBySyncId(
    () => db.clinicalRecords.toArray(),
    (row) => db.clinicalRecords.add(row),
    (id, row) => db.clinicalRecords.update(id, row),
    records,
    async (payload, remote) => {
    const patientId = await resolveLocalPatientId(payload)
    if (!patientId) return null
    return {
      ...(payload as unknown as ClinicalRecord),
      patientId,
      syncId: remote.syncId,
      clinicId: remote.clinicId,
      pendingSync: false,
      lastSyncedAt: new Date().toISOString(),
      updatedAt: remote.updatedAt || String(payload.updatedAt || new Date().toISOString()),
    }
    },
  )
}

async function mergeOdontograms(records: ClinicalSyncRecord[]): Promise<boolean> {
  return mergeBySyncId(
    () => db.odontograms.toArray(),
    (row) => db.odontograms.add(row),
    (id, row) => db.odontograms.update(id, row),
    records,
    async (payload, remote) => {
    const patientId = await resolveLocalPatientId(payload)
    if (!patientId) return null
    return {
      ...(payload as unknown as OdontogramData),
      patientId,
      syncId: remote.syncId,
      clinicId: remote.clinicId,
      pendingSync: false,
      lastSyncedAt: new Date().toISOString(),
      updatedAt: remote.updatedAt || String(payload.updatedAt || new Date().toISOString()),
    }
    },
  )
}

async function mergeDiagnosticAids(records: ClinicalSyncRecord[]): Promise<boolean> {
  let changed = false
  for (const remote of records) {
    const payload = payloadOf(remote)
    const id = String(payload.id || remote.syncId || '').trim()
    if (!id) continue
    const patientId = (await resolveLocalPatientId(payload)) || String(payload.patientId || '')
    const next: DiagnosticAid = {
      ...(payload as unknown as DiagnosticAid),
      id,
      patientId,
      encounterId: String(payload.encounterId || ''),
      fileType: (payload.fileType as DiagnosticAid['fileType']) || 'OTHER',
      fileName: String(payload.fileName || 'archivo'),
      absolutePath: String(payload.absolutePath || `[navegador]/${payload.fileName || 'archivo'}`),
      fileHash: String(payload.fileHash || ''),
      createdAt: String(payload.createdAt || remote.updatedAt),
      comments: String(payload.comments || ''),
      clinicId: remote.clinicId,
      pendingSync: false,
      lastSyncedAt: new Date().toISOString(),
    }
    await db.diagnosticAids.put(next)
    changed = true
  }
  return changed
}

async function mergeDrafts(records: ClinicalSyncRecord[]): Promise<boolean> {
  let changed = false
  for (const remote of records) {
    const payload = payloadOf(remote)
    const patientId = await resolveLocalPatientId(payload)
    if (!patientId) continue
    const next: PatientClinicalDraft = {
      ...(payload as unknown as PatientClinicalDraft),
      patientId,
      updatedAt: remote.updatedAt || String(payload.updatedAt || new Date().toISOString()),
    }
    await db.patientClinicalDrafts.put(next)
    changed = true
  }
  return changed
}

async function mergeAttachments(records: ClinicalSyncRecord[]): Promise<boolean> {
  let changed = false
  for (const remote of records) {
    const payload = payloadOf(remote)
    const aidId = String(payload.aidId || payload.id || remote.syncId || '').trim()
    const dataBase64 = String(payload.dataBase64 || '')
    if (!aidId || !dataBase64) continue
    const fileName = String(payload.fileName || 'archivo')
    const blobId = await saveDiagnosticAidBlobFromBuffer(aidId, {
      fileName,
      mimeType: String(payload.mimeType || mimeTypeForDiagnosticFile(fileName)),
      data: base64ToArrayBuffer(dataBase64),
      id: typeof payload.blobId === 'string' ? payload.blobId : undefined,
    })
    const existing = await db.diagnosticAids.get(aidId)
    if (existing) {
      await db.diagnosticAids.update(aidId, { blobId, pendingSync: false })
    }
    const queueId = String(payload.id || remote.syncId)
    const queueItem: SyncQueueAttachment = {
      id: queueId,
      entityType: 'diagnostic_aid',
      action: 'UPSERT',
      status: 'synced',
      patientId: String(payload.patientId || existing?.patientId || ''),
      encounterId: String(payload.encounterId || existing?.encounterId || ''),
      patientSyncId: String(payload.patientSyncId || existing?.patientSyncId || ''),
      aidId,
      blobId,
      fileName,
      fileHash: String(payload.fileHash || existing?.fileHash || ''),
      mimeType: String(payload.mimeType || mimeTypeForDiagnosticFile(fileName)),
      absolutePath: String(payload.absolutePath || existing?.absolutePath || ''),
      clinicId: remote.clinicId,
      createdAt: String(payload.createdAt || remote.updatedAt),
      updatedAt: remote.updatedAt,
      lastSyncedAt: new Date().toISOString(),
    }
    await db.syncQueue.put(queueItem)
    changed = true
  }
  return changed
}

export async function applyClinicSnapshot(payload: ClinicalSyncPullResponse): Promise<boolean> {
  let changed = false
  await withRemotePullLock(async () => {
    const clinicalChanged = await mergeClinicalRecords(recordsOf(payload.clinicalRecords))
    const odontogramsChanged = await mergeOdontograms(recordsOf(payload.odontograms))
    const aidsChanged = await mergeDiagnosticAids(recordsOf(payload.diagnosticAids))
    const draftsChanged = await mergeDrafts(recordsOf(payload.drafts))
    const attachmentsChanged = await mergeAttachments([
      ...recordsOf(payload.attachments),
      ...recordsOf(payload.sync_queue),
    ])
    changed = clinicalChanged || odontogramsChanged || aidsChanged || draftsChanged || attachmentsChanged
  })
  return changed
}

export async function readCachedClinicPull(): Promise<ClinicalSyncPullResponse | null> {
  const fromWindow = (window as Window & { __doctorSEOClinicPull?: ClinicalSyncPullResponse }).__doctorSEOClinicPull
  if (fromWindow && typeof fromWindow === 'object') return fromWindow
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(PULL_CACHE_DB, 1)
      req.onerror = () => resolve(null)
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(PULL_CACHE_STORE)) {
          req.result.createObjectStore(PULL_CACHE_STORE)
        }
      }
      req.onsuccess = () => {
        const idb = req.result
        if (!idb.objectStoreNames.contains(PULL_CACHE_STORE)) {
          idb.close()
          resolve(null)
          return
        }
        const tx = idb.transaction(PULL_CACHE_STORE, 'readonly')
        const getReq = tx.objectStore(PULL_CACHE_STORE).get('latest')
        getReq.onsuccess = () => {
          idb.close()
          resolve((getReq.result as ClinicalSyncPullResponse) || null)
        }
        getReq.onerror = () => {
          idb.close()
          resolve(null)
        }
      }
    } catch {
      resolve(null)
    }
  })
}

export async function pullClinicSnapshotRemote(options: { includeBlobs?: boolean } = {}): Promise<ClinicalSyncPullResponse | null> {
  const includeBlobs = options.includeBlobs !== false
  const path = `/api/sync/pull?full=${includeBlobs ? '1' : '0'}`
  const { response, payload } = await syncFetch(path)
  if (!response.ok || !(payload.success === true || payload.ok === true)) return null
  return payload as ClinicalSyncPullResponse
}

export async function pullAndApplyClinicSnapshot(options: {
  includeBlobs?: boolean
  useCache?: boolean
} = {}): Promise<boolean> {
  const includeBlobs = options.includeBlobs !== false
  if (options.useCache) {
    const cached = await readCachedClinicPull()
    if (cached) {
      await applyClinicSnapshot(cached)
    }
  }
  const remote = await pullClinicSnapshotRemote({ includeBlobs })
  if (!remote) return false
  ;(window as Window & { __doctorSEOClinicPull?: ClinicalSyncPullResponse }).__doctorSEOClinicPull = remote
  await applyClinicSnapshot(remote)
  return true
}

async function blobBase64ForAid(aidId: string): Promise<string> {
  const blob = await db.diagnosticAidBlobs.where('aidId').equals(aidId).first()
  if (!blob?.data) return ''
  return arrayBufferToBase64(blob.data)
}

export async function pushClinicSnapshotLocal(clinicId: string): Promise<boolean> {
  const [clinicalRecords, odontograms, diagnosticAids, drafts] = await Promise.all([
    db.clinicalRecords.toArray(),
    db.odontograms.toArray(),
    db.diagnosticAids.toArray(),
    db.patientClinicalDrafts.toArray(),
  ])

  for (const aid of diagnosticAids) {
    const queued = await db.syncQueue.where('aidId').equals(aid.id).first()
    if (!queued) await enqueueDiagnosticAidForSync(aid)
  }
  const pendingQueue = await listPendingSyncQueue()

  const clinicalRecordsPayload = await Promise.all(
    clinicalRecords.map(async (row) => {
      const withPatient = await withPatientSyncId({ ...row, clinicId })
      const syncId = String(withPatient.syncId || generateId())
      if (!row.syncId && row.id != null) await db.clinicalRecords.update(row.id, { syncId, clinicId })
      return toEntityRecord({ ...withPatient, syncId } as unknown as Record<string, unknown>, clinicId, syncId)
    }),
  )

  const odontogramsPayload = await Promise.all(
    odontograms.map(async (row) => {
      const withPatient = await withPatientSyncId({ ...row, clinicId })
      const syncId = String(withPatient.syncId || generateId())
      if (!row.syncId && row.id != null) await db.odontograms.update(row.id, { syncId, clinicId })
      return toEntityRecord({ ...withPatient, syncId } as unknown as Record<string, unknown>, clinicId, syncId)
    }),
  )

  const diagnosticAidsPayload = await Promise.all(
    diagnosticAids.map(async (row) => {
      const withPatient = await withPatientSyncId({ ...row, clinicId })
      return toEntityRecord({ ...withPatient } as unknown as Record<string, unknown>, clinicId, row.id)
    }),
  )

  const draftsPayload = await Promise.all(
    drafts.map(async (row) => {
      const withPatient = await withPatientSyncId({ ...row })
      const patientSyncId = await resolvePatientSyncId(String(withPatient.patientId))
      const syncId = `draft:${patientSyncId || withPatient.patientId}`
      return toEntityRecord(
        { ...withPatient, patientSyncId } as unknown as Record<string, unknown>,
        clinicId,
        syncId,
      )
    }),
  )

  const builtQueue = await Promise.all(
    pendingQueue.map(async (item) => {
      const dataBase64 = await blobBase64ForAid(item.aidId)
      if (!dataBase64 && !item.absolutePath) return null
      const syncId = item.id || item.aidId
      const record: ClinicalSyncRecord = {
        syncId,
        clinicId,
        updatedAt: item.updatedAt || new Date().toISOString(),
        payload: {
          ...item,
          dataBase64,
          entityType: 'diagnostic_aid',
          clinicId,
        },
      }
      return record
    }),
  )
  const syncQueuePayload = builtQueue.filter((row): row is ClinicalSyncRecord => row != null)

  const { response } = await syncFetch('/api/sync/push', {
    method: 'POST',
    body: JSON.stringify({
      clinicalRecords: clinicalRecordsPayload,
      odontograms: odontogramsPayload,
      diagnosticAids: diagnosticAidsPayload,
      drafts: draftsPayload,
      sync_queue: syncQueuePayload,
      attachments: syncQueuePayload,
    }),
  })
  if (!response.ok) return false
  await markSyncQueueSynced(syncQueuePayload.map((row) => row.syncId))
  return true
}

/** Pull forzado al iniciar sesión: snapshot completo con archivos, antes de renderizar. */
export async function pullCompleteClinicOnLogin(): Promise<boolean> {
  const auth = getStoredApiAuth()
  if (!auth?.token || !getCurrentClinicId()) return false
  try {
    return await pullAndApplyClinicSnapshot({ includeBlobs: true, useCache: true })
  } catch {
    return false
  }
}
