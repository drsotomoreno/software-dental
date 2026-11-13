import { db } from '@/db/database'
import { getStoredApiAuth } from '@/services/apiAuthService'
import {
  flushPendingClinicalDraft,
  getCurrentClinicId,
  withRemotePullLock,
} from '@/services/clinicalSyncState'
import { saveDiagnosticAidBlobFromBuffer } from '@/services/diagnosticAidBlobStore'
import {
  isGoogleDriveRequiredResponse,
  notifyGoogleDriveRequired,
} from '@/services/globalToast'
import {
  enqueueDiagnosticAidForSync,
  listPendingSyncQueue,
  markSyncQueueSynced,
  resolvePatientSyncId,
} from '@/services/syncQueueService'
import type { ClinicalRecord } from '@/types/clinicalRecord'
import { keepStoredConsentSignatures } from '@/types/consent'
import type { ClinicalSyncPullResponse, ClinicalSyncRecord } from '@/types/clinicalSync'
import type { DiagnosticAid } from '@/types/diagnosticAid'
import type { OdontogramData } from '@/types/odontogram'
import type { PatientClinicalDraft } from '@/types/patientClinicalDraft'
import type { SyncQueueAttachment } from '@/types/syncQueue'
import { getDesktopBridge } from '@/types/desktopBridge'
import { arrayBufferToBase64, base64ToArrayBuffer } from '@/utils/base64Binary'
import { isRemoteDraftNewer } from '@/utils/clinicalDraftMerge'
import {
  clinicalBodyHasContent,
  isSignedClinicalDocument,
  shouldReplaceClinicalDocument,
} from '../../shared/clinicalRecordGuard.js'
import { withMergedClinicalPayments } from '../../shared/paymentControlMerge.js'

function paymentFingerprint(form: {
  paymentControl?: unknown
  orthodonticsPaymentControl?: unknown
  paymentControlLines?: unknown
  paymentPlan?: unknown
  budgetItems?: unknown
  budget?: unknown
  clinicalDraft?: {
    paymentControl?: unknown
    orthodonticsPaymentControl?: unknown
    paymentControlLines?: unknown
    paymentPlan?: unknown
    budgetItems?: unknown
    budget?: unknown
  } | null
  valuationDraft?: {
    paymentControl?: unknown
    orthodonticsPaymentControl?: unknown
    paymentControlLines?: unknown
    paymentPlan?: unknown
    budgetItems?: unknown
    budget?: unknown
  } | null
} | null | undefined): string {
  if (!form) return ''
  const clinical = form.clinicalDraft
  const valuation = form.valuationDraft
  return JSON.stringify({
    p: form.paymentControl ?? clinical?.paymentControl ?? null,
    o: form.orthodonticsPaymentControl ?? clinical?.orthodonticsPaymentControl ?? null,
    l: form.paymentControlLines ?? clinical?.paymentControlLines ?? null,
    plan: form.paymentPlan ?? clinical?.paymentPlan ?? null,
    b: form.budgetItems ?? clinical?.budgetItems ?? null,
    bt: form.budget ?? clinical?.budget ?? null,
    vp: valuation?.paymentControl ?? null,
    vo: valuation?.orthodonticsPaymentControl ?? null,
    vl: valuation?.paymentControlLines ?? null,
    vplan: valuation?.paymentPlan ?? null,
    vb: valuation?.budgetItems ?? null,
    vbt: valuation?.budget ?? null,
  })
}
import {
  clinicalDraftHasSection4,
  odontogramHasMarks,
  pickOdontogramFromCandidates,
} from '@/utils/odontogramPersistence'
import { listOdontogramsForPatient } from '@/utils/patientId'
import { generateId } from '@/utils/crypto'
import {
  hasLocalDiskPath,
  mimeTypeForDiagnosticFile,
} from '@/utils/diagnosticAidWebClassification'

const LOCAL_ONLY_KEYS = new Set(['id', 'pendingSync', 'lastSyncedAt'])
/** Binarios: solo metadatos en /api/sync/push y /api/sync/clinical. */
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
const DIAGNOSTIC_AID_META_KEYS = new Set([
  'id',
  'syncId',
  'clinicId',
  'patientId',
  'patientSyncId',
  'encounterId',
  'name',
  'fileName',
  'mimeType',
  'fileType',
  'size',
  'byteLength',
  'fileHash',
  'sha256',
  'driveFileId',
  'driveWebViewLink',
  'webViewLink',
  'storageStatus',
  'storageBackend',
  'driveUploadStatus',
  'receivedAt',
  'notes',
  'comments',
  'createdAt',
  'updatedAt',
  'deletedAt',
  'entityType',
  'action',
  'hasBinary',
  'binarySynced',
  'aidId',
  'deletedDiagnosticAids',
])
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

function notifyIfGoogleDriveRequired(response: Response, payload: unknown): boolean {
  if (!isGoogleDriveRequiredResponse(response, payload)) return false
  notifyGoogleDriveRequired()
  return true
}

function stripHeavyBinaryFields(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map((row) => stripHeavyBinaryFields(row))
  const out: Record<string, unknown> = {}
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (HEAVY_BINARY_KEYS.has(key) || LOCAL_ONLY_KEYS.has(key)) continue
    if (
      typeof entry === 'string' &&
      entry.length > 64 * 1024 &&
      (/^data:/i.test(entry) || /^[A-Za-z0-9+/=\s]{256,}/.test(entry.slice(0, 80)))
    ) {
      continue
    }
    out[key] = entry && typeof entry === 'object' ? stripHeavyBinaryFields(entry) : entry
  }
  return out
}

function toSyncPayload(entity: Record<string, unknown>): Record<string, unknown> {
  return stripHeavyBinaryFields(entity) as Record<string, unknown>
}

/** Metadatos ligeros de ayudas diagnósticas (sin binarios). */
function toDiagnosticAidMetaPayload(entity: Record<string, unknown>): Record<string, unknown> {
  const stripped = stripHeavyBinaryFields(entity) as Record<string, unknown>
  const payload: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(stripped)) {
    if (DIAGNOSTIC_AID_META_KEYS.has(key) || key.startsWith('drive')) {
      payload[key] = value
    }
  }
  if (!payload.name && payload.fileName) payload.name = payload.fileName
  if (!payload.size && payload.byteLength != null) payload.size = payload.byteLength
  if (!payload.sha256 && payload.fileHash) payload.sha256 = payload.fileHash
  if (!payload.driveWebViewLink && payload.webViewLink) {
    payload.driveWebViewLink = payload.webViewLink
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

async function mergeClinicalRecords(records: ClinicalSyncRecord[]): Promise<boolean> {
  let changed = false
  const locals = await db.clinicalRecords.toArray()
  const bySync = new Map(
    locals.filter((row) => row.syncId).map((row) => [String(row.syncId), row]),
  )

  for (const remote of records) {
    const payload = payloadOf(remote)
    const local = bySync.get(remote.syncId)
    const resolvedPatientId = await resolveLocalPatientId(payload)
    const patientId = local?.patientId != null ? String(local.patientId) : resolvedPatientId
    if (!patientId) continue

    const next: ClinicalRecord = {
      ...(payload as unknown as ClinicalRecord),
      patientId,
      syncId: remote.syncId,
      clinicId: remote.clinicId,
      pendingSync: false,
      lastSyncedAt: new Date().toISOString(),
      updatedAt: remote.updatedAt || String(payload.updatedAt || new Date().toISOString()),
    }

    if (local?.id != null) {
      if (!shouldReplaceClinicalDocument(local, { ...remote, payload: next })) {
        // Aunque el remoto no reemplace el cuerpo clínico, los abonos se unen por id.
        const paymentsOnly = withMergedClinicalPayments(local, next)
        if (paymentFingerprint(paymentsOnly) !== paymentFingerprint(local)) {
          await db.clinicalRecords.update(local.id, {
            paymentControl: paymentsOnly.paymentControl,
            paymentControlLines: paymentsOnly.paymentControlLines,
            orthodonticsPaymentControl: paymentsOnly.orthodonticsPaymentControl,
            paymentPlan: paymentsOnly.paymentPlan,
            budgetItems: paymentsOnly.budgetItems,
            budget: paymentsOnly.budget,
            pendingSync: true,
          })
          changed = true
        }
        continue
      }
      const merged = withMergedClinicalPayments(next, local)
      const patch = {
        ...merged,
        informedConsent: merged.informedConsent
          ? keepStoredConsentSignatures(local.informedConsent, merged.informedConsent)
          : (local.informedConsent ?? merged.informedConsent),
      }
      delete patch.id
      await db.clinicalRecords.update(local.id, patch)
      changed = true
      continue
    }

    const patientAlreadyHasHistory = locals.some(
      (row) =>
        String(row.patientId) === patientId &&
        (clinicalBodyHasContent(row) || isSignedClinicalDocument(row)),
    )
    if (
      patientAlreadyHasHistory &&
      !clinicalBodyHasContent(next) &&
      !isSignedClinicalDocument(next)
    ) {
      continue
    }

    const withId = { ...next }
    delete withId.id
    await db.clinicalRecords.add(withId)
    changed = true
  }

  return changed
}

async function mergeOdontograms(records: ClinicalSyncRecord[]): Promise<boolean> {
  let changed = false
  const byPatient = new Map<string, OdontogramData[]>()

  for (const remote of records) {
    const payload = payloadOf(remote)
    const patientId = await resolveLocalPatientId(payload)
    if (!patientId) continue
    const remoteChart: OdontogramData = {
      ...(payload as unknown as OdontogramData),
      patientId,
      syncId: remote.syncId,
      clinicId: remote.clinicId,
      pendingSync: false,
      lastSyncedAt: new Date().toISOString(),
      updatedAt: remote.updatedAt || String(payload.updatedAt || new Date().toISOString()),
    }
    const group = byPatient.get(patientId) ?? []
    group.push(remoteChart)
    byPatient.set(patientId, group)
  }

  for (const [patientId, remotes] of byPatient) {
    const locals = await listOdontogramsForPatient(patientId)
    const canonical = pickOdontogramFromCandidates(locals)
    const winner = pickOdontogramFromCandidates([canonical, ...remotes])
    if (!winner) continue

    const remoteWon = remotes.includes(winner)
    const blankRemoteIsNewer = Boolean(
      canonical &&
        winner === canonical &&
        odontogramHasMarks(canonical) &&
        remotes.some(
          (remote) =>
            !odontogramHasMarks(remote) &&
            isRemoteDraftNewer(canonical.updatedAt, remote.updatedAt),
        ),
    )

    if (remoteWon) {
      const patch: OdontogramData = { ...winner, patientId }
      delete patch.id
      if (canonical?.id != null) {
        await db.odontograms.update(canonical.id, patch)
      } else {
        await db.odontograms.add(patch)
      }
      changed = true
    } else if (blankRemoteIsNewer && canonical?.id != null) {
      await db.odontograms.update(canonical.id, {
        updatedAt: new Date().toISOString(),
        pendingSync: true,
      })
      changed = true
    }

    const keepId = canonical?.id
    for (const row of locals) {
      if (row.id == null || String(row.id) === String(keepId)) continue
      await db.odontograms.delete(row.id)
      changed = true
    }
  }

  return changed
}

async function mergeDiagnosticAids(records: ClinicalSyncRecord[]): Promise<boolean> {
  let changed = false
  for (const remote of records) {
    const payload = payloadOf(remote)
    const id = String(payload.id || remote.syncId || '').trim()
    if (!id) continue

    const tombstone = await db.deletedDiagnosticAids.get(id)
    const remoteDeletedAt = String(remote.deletedAt || payload.deletedAt || '').trim()
    if (tombstone || remoteDeletedAt) {
      const existing = await db.diagnosticAids.get(id)
      if (existing) {
        await db.diagnosticAids.delete(id)
        changed = true
      }
      if (!tombstone) {
        await db.deletedDiagnosticAids.put({
          id,
          clinicId: remote.clinicId || String(payload.clinicId || ''),
          fileName: String(payload.fileName || ''),
          deletedAt: remoteDeletedAt || new Date().toISOString(),
        })
        changed = true
      }
      continue
    }

    const patientId = (await resolveLocalPatientId(payload)) || String(payload.patientId || '')
    const next: DiagnosticAid = {
      ...(payload as unknown as DiagnosticAid),
      id,
      patientId,
      encounterId: String(payload.encounterId || payload.evolutionId || ''),
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
    const remoteUpdatedAt = remote.updatedAt || String(payload.updatedAt || '')
    const local = await db.patientClinicalDrafts.get(patientId)
    const next: PatientClinicalDraft = {
      ...(payload as unknown as PatientClinicalDraft),
      patientId,
      updatedAt: remoteUpdatedAt || new Date().toISOString(),
    }
    const remoteRecord = { ...remote, payload: next, updatedAt: next.updatedAt }
    if (local && !shouldReplaceClinicalDocument(local, remoteRecord)) {
      const remoteIsEmptyShell =
        !clinicalBodyHasContent(next) && !isSignedClinicalDocument(next)
      const localHasHistory =
        clinicalBodyHasContent(local) ||
        isSignedClinicalDocument(local) ||
        clinicalDraftHasSection4(local)
      // Une abonos del remoto aunque el borrador local gane el resto del documento.
      const paymentsMerged = withMergedClinicalPayments(local, next)
      if (paymentFingerprint(paymentsMerged) !== paymentFingerprint(local)) {
        await db.patientClinicalDrafts.put({
          ...paymentsMerged,
          updatedAt: new Date().toISOString(),
        })
        changed = true
      } else if (localHasHistory && remoteIsEmptyShell) {
        await db.patientClinicalDrafts.update(patientId, { updatedAt: new Date().toISOString() })
        changed = true
      }
      continue
    }
    const winner = local ? withMergedClinicalPayments(next, local) : next
    const kept: PatientClinicalDraft = local
      ? {
          ...winner,
          clinicalDraft: winner.clinicalDraft
            ? {
                ...winner.clinicalDraft,
                informedConsent: keepStoredConsentSignatures(
                  local.clinicalDraft?.informedConsent,
                  winner.clinicalDraft.informedConsent,
                ),
              }
            : winner.clinicalDraft,
          valuationDraft: winner.valuationDraft
            ? {
                ...winner.valuationDraft,
                informedConsent: keepStoredConsentSignatures(
                  local.valuationDraft?.informedConsent,
                  winner.valuationDraft.informedConsent,
                ),
              }
            : winner.valuationDraft,
        }
      : winner
    await db.patientClinicalDrafts.put(kept)
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
      binarySynced: true,
    }
    await db.syncQueue.put(queueItem)
    changed = true
  }
  return changed
}

async function fetchRemoteAttachment(params: Record<string, string>): Promise<ClinicalSyncRecord | null> {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value)
  }
  const tenantId = String(getStoredApiAuth()?.user?.clinicId || getStoredApiAuth()?.user?.id || '').trim()
  if (tenantId) search.set('tenant_id', tenantId)
  const { response, payload } = await syncFetch(`/api/sync/attachment?${search.toString()}`)
  if (notifyIfGoogleDriveRequired(response, payload)) return null
  if (!response.ok || !payload?.attachment) return null
  return payload.attachment as ClinicalSyncRecord
}

function recordHasBlob(record: ClinicalSyncRecord): boolean {
  const payload = payloadOf(record)
  return Boolean(payload.dataBase64 || (record as { dataBase64?: string }).dataBase64)
}

async function hydrateMissingAttachmentBlobs(
  snapshot: ClinicalSyncPullResponse,
): Promise<ClinicalSyncPullResponse> {
  const rows = [
    ...recordsOf(snapshot.attachments),
    ...recordsOf(snapshot.sync_queue),
    ...recordsOf(snapshot.diagnosticAids),
  ]
  const lookups: Record<string, string>[] = []
  const seen = new Set<string>()
  for (const row of rows) {
    if (recordHasBlob(row)) continue
    const payload = payloadOf(row)
    const id = String(payload.aidId || payload.id || row.syncId || '').trim()
    const fileHash = String(payload.fileHash || '').trim()
    const patientId = String(payload.patientSyncId || payload.patientId || '').trim()
    const encounterId = String(payload.encounterId || payload.evolutionId || '').trim()
    const key = id || fileHash || `${patientId}:${encounterId}`
    if (!key || seen.has(key)) continue
    seen.add(key)
    lookups.push({
      id,
      aidId: id,
      fileHash,
      patientId,
      encounterId,
      evolutionId: encounterId,
    })
  }
  if (!lookups.length) return snapshot

  const extras: ClinicalSyncRecord[] = []
  const concurrency = 4
  let cursor = 0
  async function worker() {
    while (cursor < lookups.length) {
      const current = lookups[cursor]
      cursor += 1
      try {
        const attachment = await fetchRemoteAttachment(current)
        if (attachment && recordHasBlob(attachment)) extras.push(attachment)
      } catch {
        /* siguiente adjunto */
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, lookups.length) }, () => worker()))
  return {
    ...snapshot,
    attachments: [...recordsOf(snapshot.attachments), ...extras],
  }
}

export async function applyClinicSnapshot(
  payload: ClinicalSyncPullResponse,
  options: { hydrateBlobs?: boolean } = {},
): Promise<boolean> {
  const hydrated = options.hydrateBlobs ? await hydrateMissingAttachmentBlobs(payload) : payload
  let changed = false
  await withRemotePullLock(async () => {
    const clinicalChanged = await mergeClinicalRecords(recordsOf(hydrated.clinicalRecords))
    const odontogramsChanged = await mergeOdontograms(recordsOf(hydrated.odontograms))
    const aidsChanged = await mergeDiagnosticAids(recordsOf(hydrated.diagnosticAids))
    const draftsChanged = await mergeDrafts(recordsOf(hydrated.drafts))
    const attachmentsChanged = await mergeAttachments([
      ...recordsOf(hydrated.attachments),
      ...recordsOf(hydrated.sync_queue),
    ])
    changed = clinicalChanged || odontogramsChanged || aidsChanged || draftsChanged || attachmentsChanged
  })
  return changed
}

export async function readCachedClinicPull(): Promise<ClinicalSyncPullResponse | null> {
  const { getCurrentClinicId } = await import('@/services/clinicalSyncState')
  const { clinicIdsMatch, readCachedPullKey } = await import('@/services/clinicLocalIsolation')
  const clinicId = getCurrentClinicId()

  const fromWindow = (window as Window & { __doctorSEOClinicPull?: ClinicalSyncPullResponse })
    .__doctorSEOClinicPull
  if (
    fromWindow &&
    typeof fromWindow === 'object' &&
    clinicId &&
    fromWindow.clinicId &&
    clinicIdsMatch(fromWindow.clinicId, clinicId)
  ) {
    return fromWindow
  }

  if (!clinicId) return null
  const cacheKey = readCachedPullKey(clinicId)

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
        // Solo la clave de esta clínica. Nunca 'latest' global (mezcla tenants).
        const getReq = tx.objectStore(PULL_CACHE_STORE).get(cacheKey)
        getReq.onsuccess = () => {
          idb.close()
          const value = (getReq.result as ClinicalSyncPullResponse) || null
          if (value?.clinicId && !clinicIdsMatch(value.clinicId, clinicId)) {
            resolve(null)
            return
          }
          resolve(value)
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
      await applyClinicSnapshot(cached, { hydrateBlobs: includeBlobs })
    }
  }
  const remote = await pullClinicSnapshotRemote({ includeBlobs })
  if (!remote) return false
  ;(window as Window & { __doctorSEOClinicPull?: ClinicalSyncPullResponse }).__doctorSEOClinicPull = remote
  await applyClinicSnapshot(remote, { hydrateBlobs: includeBlobs })
  return true
}

async function blobBase64ForAid(aidId: string): Promise<string> {
  const blob = await db.diagnosticAidBlobs.where('aidId').equals(aidId).first()
  if (blob?.data) return arrayBufferToBase64(blob.data)

  const aid = await db.diagnosticAids.get(aidId)
  const bridge = getDesktopBridge()
  if (aid && bridge?.readFileBytes && hasLocalDiskPath(aid)) {
    try {
      const data = await bridge.readFileBytes(aid.absolutePath)
      await saveDiagnosticAidBlobFromBuffer(aidId, {
        fileName: aid.fileName,
        mimeType: mimeTypeForDiagnosticFile(aid.fileName),
        data,
      })
      return arrayBufferToBase64(data)
    } catch {
      return ''
    }
  }
  return ''
}

export async function pushClinicSnapshotLocal(clinicId: string): Promise<boolean> {
  const { clinicIdsMatch } = await import('@/services/clinicLocalIsolation')
  const ownClinic = <T extends { clinicId?: string | null }>(rows: T[]) =>
    rows.filter((row) => !row.clinicId || clinicIdsMatch(row.clinicId, clinicId))
  await flushPendingClinicalDraft()
  const [clinicalRecords, odontograms, diagnosticAids, drafts] = await Promise.all([
    db.clinicalRecords.toArray().then(ownClinic),
    db.odontograms.toArray().then(ownClinic),
    db.diagnosticAids.toArray().then(ownClinic),
    db.patientClinicalDrafts.toArray().then(ownClinic),
  ])

  for (const aid of diagnosticAids) {
    const queued = await db.syncQueue.where('aidId').equals(aid.id).first()
    if (!queued) {
      await enqueueDiagnosticAidForSync(aid)
      continue
    }
    // Solo metadatos / Drive: no encolar binarios Base64.
    if (queued.binarySynced === true || queued.driveFileId) continue
    if (aid.driveFileId) {
      await enqueueDiagnosticAidForSync(aid, {
        driveFileId: aid.driveFileId,
        binarySynced: true,
        mimeType: mimeTypeForDiagnosticFile(aid.fileName),
      })
    }
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

  const tombstones = await db.deletedDiagnosticAids.toArray()
  const diagnosticAidsPayload = await Promise.all([
    ...diagnosticAids.map(async (row) => {
      const withPatient = await withPatientSyncId({ ...row, clinicId })
      const meta = toDiagnosticAidMetaPayload({
        ...(withPatient as unknown as Record<string, unknown>),
      })
      return {
        syncId: row.id,
        clinicId,
        updatedAt: String(row.updatedAt || row.createdAt || new Date().toISOString()),
        deletedAt: null,
        payload: meta,
      } satisfies ClinicalSyncRecord
    }),
    ...tombstones.map(async (row) => {
      const deletedAt = row.deletedAt || new Date().toISOString()
      return {
        syncId: row.id,
        clinicId: row.clinicId || clinicId,
        updatedAt: deletedAt,
        deletedAt,
        payload: {
          id: row.id,
          fileName: row.fileName || '',
          deletedAt,
          clinicId: row.clinicId || clinicId,
        },
      }
    }),
  ])

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

  const builtQueue = pendingQueue.map((item) => {
    const syncId = item.id || item.aidId
    const updatedAt = item.updatedAt || new Date().toISOString()
    const meta = toDiagnosticAidMetaPayload({
      ...(item as unknown as Record<string, unknown>),
      id: item.aidId,
      entityType: 'diagnostic_aid',
      clinicId,
    })

    if (item.action === 'DELETE') {
      const record: ClinicalSyncRecord = {
        syncId: item.aidId || syncId,
        clinicId,
        updatedAt,
        deletedAt: updatedAt,
        payload: {
          ...meta,
          action: 'DELETE',
          deletedAt: updatedAt,
          hasBinary: false,
        },
      }
      return record
    }

    // Sin Base64: solo metadatos (driveFileId / webViewLink tras subida a Drive).
    const record: ClinicalSyncRecord = {
      syncId,
      clinicId,
      updatedAt,
      payload: {
        ...meta,
        hasBinary: Boolean(item.driveFileId || item.binarySynced),
        driveFileId: item.driveFileId || undefined,
        webViewLink: item.webViewLink || undefined,
        driveWebViewLink: item.webViewLink || undefined,
      },
    }
    return record
  })
  const syncQueuePayload = builtQueue.filter((row): row is ClinicalSyncRecord => row != null)

  const pushBody = stripHeavyBinaryFields({
    clinicalRecords: clinicalRecordsPayload,
    odontograms: odontogramsPayload,
    diagnosticAids: diagnosticAidsPayload,
    drafts: draftsPayload,
    sync_queue: syncQueuePayload,
    attachments: syncQueuePayload,
    deletedDiagnosticAids: tombstones.map((row) => ({
      id: row.id,
      fileName: row.fileName || '',
      deletedAt: row.deletedAt,
      clinicId: row.clinicId || clinicId,
    })),
  })

  const metadataResponse = await syncFetch('/api/sync/push', {
    method: 'POST',
    body: JSON.stringify(pushBody),
  })
  if (notifyIfGoogleDriveRequired(metadataResponse.response, metadataResponse.payload)) {
    return false
  }
  if (!metadataResponse.response.ok) return false

  await markSyncQueueSynced(pendingQueue.map((item) => item.id).filter(Boolean))
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
