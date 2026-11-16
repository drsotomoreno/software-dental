import { join } from 'node:path'
import { readFile, stat } from 'node:fs/promises'
import { config } from '../config.js'
import {
  base64ToBuffer,
  bufferToBase64,
  isGoogleDriveRequiredError,
  readAttachmentBytes,
  writeAttachmentBytes,
} from './clinicAttachmentStore.js'
import { readDurableJsonWithMerge, writeDurableJsonReplace } from './durableStore.js'
import {
  mergeAdministrativeClinicalFields,
  shouldReplaceClinicalDocument,
  stripClinicalPayloadEvolutionPatientSignatures,
} from '../../shared/clinicalRecordGuard.js'
import { rejectsSignedClinicalMutation } from '../utils/clinicalHash.js'
import { withMergedClinicalPayments } from '../../shared/paymentControlMerge.js'
import { odontogramRecordHasMarks } from './odontogramMerge.js'
import { conservarFechaApertura } from '../../shared/patientOpenedAt.js'
import { clinicKeyInScope } from '../../shared/clinicalSyncScope.js'
import { mergeSyncedRecordNonDestructive } from '../../shared/clinicalSyncMerge.js'
import { omitHeavyClinicalDraftForms } from '../../shared/clinicalSyncHeavyPayload.js'
import {
  assertClinicalArrayLimits,
  isClinicalArrayCircuitError,
  sanitizeClinicalRecordArrays,
} from '../../shared/clinicalSyncCircuitBreaker.js'
import { clinicalSyncEvents, SNAPSHOT_PUSHED } from './clinicalSyncEvents.js'

/**
 * Emite el delta al indexador CQRS sin await.
 * Si el listener falla o tarda, el push HTTP ya respondió / sigue su curso.
 */
function emitSnapshotPushed(clinicId, payload, accepted) {
  try {
    clinicalSyncEvents.emit(SNAPSHOT_PUSHED, {
      clinicId,
      payload,
      accepted,
      pushedAt: new Date().toISOString(),
    })
  } catch (error) {
    console.error(
      '[Sync] No se pudo emitir snapshot:pushed (el guardado ya quedó persistido):',
      error instanceof Error ? error.message : error,
    )
  }
}

const STORE_FILE = join(config.dataDir, 'clinical-sync.json')
/** Índice liviano: patients, appointments y metadatos de exámenes (pull full=0 sin parsear ~83MB). */
const META_FILE = join(config.dataDir, 'clinical-sync-meta.json')
const STORE_KEY = 'clinical-sync'

const ENTITY_MAPS = [
  'patients',
  'appointments',
  'clinicalRecords',
  'odontograms',
  'diagnosticAids',
  'attachments',
  'drafts',
  'sync_queue',
]

function emptyStore() {
  return { clinics: {} }
}

function emptyClinic() {
  return {
    patients: {},
    appointments: {},
    clinicalRecords: {},
    odontograms: {},
    diagnosticAids: {},
    attachments: {},
    drafts: {},
    sync_queue: {},
  }
}

function stamp(record) {
  const deleted = Date.parse(record?.deletedAt || '') || 0
  const updated = Date.parse(record?.updatedAt || '') || 0
  return Math.max(deleted, updated)
}

function shouldReplaceSyncedRecord(prev, next, entityKey) {
  if (!prev) return true
  if (entityKey === 'clinicalRecords' || entityKey === 'drafts') {
    return shouldReplaceClinicalDocument(prev, next)
  }
  if (
    entityKey === 'odontograms' &&
    odontogramRecordHasMarks(prev) &&
    !odontogramRecordHasMarks(next)
  ) {
    return false
  }
  return stamp(next) >= stamp(prev)
}

function sellarAperturaPaciente(prev, record) {
  if (!record?.payload || typeof record.payload !== 'object') return record
  const kept = conservarFechaApertura(prev?.payload?.createdAt, record.payload.createdAt)
  if (kept) {
    return { ...record, payload: { ...record.payload, createdAt: kept } }
  }
  if (!prev) {
    return {
      ...record,
      payload: { ...record.payload, createdAt: new Date().toISOString() },
    }
  }
  return record
}

function isExplicitDiagnosticDelete(record) {
  if (!record || typeof record !== 'object') return false
  const payload = record.payload && typeof record.payload === 'object' ? record.payload : {}
  if (payload.explicitDelete !== true) return false
  return Boolean(record.deletedAt || payload.deletedAt)
}

/** Un Dexie vacío no puede tumbar un STL. Solo explicitDelete (clic en Quitar) borra. */
function mergeDiagnosticAidServerRecord(prev, next) {
  if (isExplicitDiagnosticDelete(next)) {
    const deletedAt = String(next.deletedAt || next.payload?.deletedAt || new Date().toISOString())
    return {
      ...next,
      deletedAt,
      payload: {
        ...(next.payload || {}),
        explicitDelete: true,
        deletedAt,
        deletedBy: next.payload?.deletedBy || null,
      },
    }
  }
  if (isExplicitDiagnosticDelete(prev)) return prev
  const activeNext = { ...next, deletedAt: null }
  const merged = prev
    ? mergeSyncedRecordNonDestructive(prev, activeNext, { preferNextMeta: true })
    : activeNext
  const payload = { ...(merged.payload || {}) }
  delete payload.explicitDelete
  payload.deletedAt = null
  return { ...merged, deletedAt: null, payload }
}

function mergeClinicalEntityRecord(prev, next, entityKey) {
  if (entityKey === 'diagnosticAids') return mergeDiagnosticAidServerRecord(prev, next)
  const merged = mergeClinicalEntityBody(prev, next, entityKey)
  return entityKey === 'patients' ? sellarAperturaPaciente(prev, merged) : merged
}

function mergeClinicalEntityBody(prev, next, entityKey) {
  if (!prev) return next
  if (entityKey !== 'clinicalRecords' && entityKey !== 'drafts') {
    // Pacientes, odontogramas, citas, etc.: nunca reemplazo destructivo del payload.
    if (!shouldReplaceSyncedRecord(prev, next, entityKey)) return prev
    return mergeSyncedRecordNonDestructive(prev, next, { preferNextMeta: true })
  }

  // Hard reject: si el servidor ya tiene signedAt y el SHA-256 del núcleo clínico
  // entrante no coincide con el recalculado del guardado, se conserva el sello.
  if (rejectsSignedClinicalMutation(prev, next)) {
    const sealed = mergeAdministrativeClinicalFields(prev, next)
    const mergedPayload = withMergedClinicalPayments(
      { ...(sealed.payload || sealed), updatedAt: prev.updatedAt },
      next.payload || {},
    )
    const { updatedAt: _ignored, ...payload } = mergedPayload
    return {
      ...prev,
      payload: {
        ...(prev.payload || {}),
        ...payload,
        evolutionNotes:
          payload.evolutionNotes ??
          sealed.payload?.evolutionNotes ??
          prev.payload?.evolutionNotes,
      },
    }
  }

  if (shouldReplaceSyncedRecord(prev, next, entityKey)) {
    // El ganador conserva también los abonos del perdedor (unión por id).
    const mergedPayload = withMergedClinicalPayments(
      { ...(next.payload || {}), updatedAt: next.updatedAt },
      prev.payload || {},
    )
    const { updatedAt: _ignored, ...payload } = mergedPayload
    return {
      ...next,
      payload: {
        ...(next.payload || {}),
        ...payload,
      },
    }
  }
  const sealedKeep = mergeAdministrativeClinicalFields(prev, next)
  const mergedPayload = withMergedClinicalPayments(
    { ...(sealedKeep.payload || prev.payload || {}), updatedAt: prev.updatedAt },
    next.payload || {},
  )
  const { updatedAt: _ignored, ...payload } = mergedPayload
  return {
    ...prev,
    payload: {
      ...(prev.payload || {}),
      ...payload,
    },
  }
}

function mergeRecordMaps(left = {}, right = {}, entityKey = '') {
  const out = { ...left }
  for (const [syncId, record] of Object.entries(right)) {
    if (!record || typeof record !== 'object') continue
    const prev = out[syncId]
    out[syncId] = mergeClinicalEntityRecord(prev, record, entityKey)
  }
  return out
}

function cloneMap(value) {
  return value && typeof value === 'object' ? { ...value } : {}
}

function clinicBucket(store, clinicId) {
  const clinics = store?.clinics && typeof store.clinics === 'object' ? store.clinics : {}
  const bucket = clinics[clinicId]
  if (!bucket || typeof bucket !== 'object') return emptyClinic()
  const next = emptyClinic()
  for (const key of ENTITY_MAPS) {
    next[key] = cloneMap(bucket[key])
  }
  return next
}

function mergeClinicBuckets(store, clinicIds) {
  const merged = emptyClinic()
  for (const clinicId of clinicIds) {
    if (!clinicId) continue
    const bucket = clinicBucket(store, clinicId)
    for (const key of ENTITY_MAPS) {
      merged[key] = mergeRecordMaps(merged[key], bucket[key], key)
    }
  }
  return merged
}

function cloneClinic(clinic) {
  const next = emptyClinic()
  for (const key of ENTITY_MAPS) {
    next[key] = { ...clinic[key] }
  }
  return next
}

function scopeIds(clinicId, aliasIds = []) {
  const canonical = String(clinicId || '').trim()
  return [...new Set([canonical, ...aliasIds.map((id) => String(id || '').trim())].filter(Boolean))]
}

/** Fusiona almacenes clínicos por clinicId y LWW por syncId. */
export function mergeClinicalStores(primary, secondary) {
  const left = primary && typeof primary === 'object' ? primary : emptyStore()
  const right = secondary && typeof secondary === 'object' ? secondary : emptyStore()
  const clinicIds = new Set([
    ...Object.keys(left.clinics && typeof left.clinics === 'object' ? left.clinics : {}),
    ...Object.keys(right.clinics && typeof right.clinics === 'object' ? right.clinics : {}),
  ])
  const clinics = {}
  for (const clinicId of clinicIds) {
    const a = clinicBucket(left, clinicId)
    const b = clinicBucket(right, clinicId)
    const merged = emptyClinic()
    for (const key of ENTITY_MAPS) {
      merged[key] = mergeRecordMaps(a[key], b[key], key)
    }
    clinics[clinicId] = merged
  }
  return { clinics }
}

/**
 * Metadatos de exámenes complementarios que sí viajan en clinical-sync.
 * Nunca incluyen base64, buffers ni rutas locales.
 */
const DIAGNOSTIC_AID_LIGHT_KEYS = [
  'id',
  'patientId',
  'patientSyncId',
  'clinicId',
  'encounterId',
  'fileName',
  'fileType',
  'mimeType',
  'receivedAt',
  'createdAt',
  'comments',
  'fileHash',
  'sha256',
  'driveFileId',
  'webViewLink',
  'driveWebViewLink',
  'byteLength',
  'storageBackend',
  'driveUploadStatus',
  'explicitDelete',
  'deletedBy',
  'updatedAt',
]

function lightweightDiagnosticAidPayload(source, clinicId) {
  const raw = source && typeof source === 'object' ? source : {}
  const payload = {}
  for (const key of DIAGNOSTIC_AID_LIGHT_KEYS) {
    const value = raw[key]
    if (value == null || value === '') continue
    if (typeof value === 'string' && isHeavyBinaryString(value)) continue
    payload[key] = value
  }
  if (!payload.id && raw.aidId) payload.id = String(raw.aidId)
  if (clinicId) payload.clinicId = clinicId
  if (payload.fileHash && !payload.sha256) payload.sha256 = payload.fileHash
  if (payload.webViewLink && !payload.driveWebViewLink) {
    payload.driveWebViewLink = payload.webViewLink
  }
  if (payload.driveFileId) {
    payload.storageBackend = 'google_drive'
    if (!payload.driveUploadStatus) payload.driveUploadStatus = 'uploaded'
  }
  if (payload.byteLength != null) payload.byteLength = Number(payload.byteLength) || 0
  return payload
}

/** Registro listo para pull: solo metadatos livianos, sin binario. */
export function lightweightDiagnosticAidRecord(record) {
  if (!record || typeof record !== 'object') return null
  const payloadIn =
    record.payload && typeof record.payload === 'object' && !Array.isArray(record.payload)
      ? record.payload
      : record
  const payload = lightweightDiagnosticAidPayload(payloadIn, record.clinicId)
  const syncId = String(record.syncId || payload.id || '').trim()
  if (!syncId) return null
  payload.id = payload.id || syncId
  return {
    syncId,
    clinicId: record.clinicId || payload.clinicId || '',
    updatedAt: String(record.updatedAt || payload.updatedAt || ''),
    deletedAt: record.deletedAt ? String(record.deletedAt) : null,
    payload,
  }
}

/**
 * Upsert atómico de UNA ayuda diagnóstica tras subir el binario a Drive.
 * No escribe base64. Corre en la misma cola que el resto de clinical-sync.
 */
export async function upsertDiagnosticAidMetadata(clinicId, aliasIds = [], meta = {}) {
  const canonical = String(clinicId || '').trim()
  const aidId = String(meta.id || meta.aidId || '').trim()
  if (!canonical) {
    const err = new Error('clinicId canónico vacío; no se guardó el metadato del examen.')
    err.code = 'CLINIC_REQUIRED'
    throw err
  }
  if (!aidId) {
    const err = new Error('aidId es obligatorio para persistir el examen.')
    err.code = 'INVALID_AID'
    throw err
  }

  return enqueueWrite(async () => {
    const store = await loadStore()
    const clinic = foldAliasesIntoCanonical(store, canonical, aliasIds)
    const now = new Date().toISOString()
    const prev = clinic.diagnosticAids[aidId]
    const incomingAt = String(meta.updatedAt || now)
    if (prev?.deletedAt && stamp(prev) > (Date.parse(incomingAt) || 0)) {
      return { ok: true, aidId, skipped: 'deleted' }
    }
    const prevPayload =
      prev?.payload && typeof prev.payload === 'object' ? prev.payload : {}
    const payload = lightweightDiagnosticAidPayload(
      {
        ...prevPayload,
        ...meta,
        id: aidId,
        updatedAt: incomingAt,
        storageBackend: 'google_drive',
        driveUploadStatus: 'uploaded',
      },
      canonical,
    )
    clinic.diagnosticAids[aidId] = {
      syncId: aidId,
      clinicId: canonical,
      updatedAt: incomingAt,
      deletedAt: null,
      payload,
    }
    replicateAliases(store, canonical, clinic, aliasIds)
    await saveStore(store)
    return { ok: true, aidId, metadataPersisted: true }
  })
}

/** Campos binarios pesados: nunca persistir en app_json_store / clinical-sync.json. */
const HEAVY_BINARY_KEYS = [
  'dataUrl',
  'dataBase64',
  'base64',
  'fileData',
  'arrayBuffer',
  'blob',
  'data',
  'buffer',
  'bytes',
]

/** t3.micro: strings >50k con Base64/DataURL hinchan clinical-sync.json a decenas de MB. */
const MAX_INLINE_BINARY_CHARS = 50_000

function isHeavyBinaryString(entry) {
  if (typeof entry !== 'string' || entry.length <= MAX_INLINE_BINARY_CHARS) return false
  return /^data:/i.test(entry) || /^[A-Za-z0-9+/=\s]+$/.test(entry.slice(0, 120))
}

function stripHeavyBinaryFields(value) {
  if (!value || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map((row) => stripHeavyBinaryFields(row))
  const out = {}
  for (const [key, entry] of Object.entries(value)) {
    if (HEAVY_BINARY_KEYS.includes(key)) continue
    if (isHeavyBinaryString(entry)) continue
    out[key] =
      entry && typeof entry === 'object' ? stripHeavyBinaryFields(entry) : entry
  }
  return out
}

/** Quita binarios sueltos y conserva clinicalDraft / valuationDraft enteros (ficha de un paciente). */
function stripHeavyKeepingClinicalDrafts(value) {
  if (!value || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map((row) => stripHeavyKeepingClinicalDrafts(row))
  const out = {}
  for (const [key, entry] of Object.entries(value)) {
    if (key === 'clinicalDraft' || key === 'valuationDraft') {
      out[key] = entry
      continue
    }
    if (HEAVY_BINARY_KEYS.includes(key)) continue
    if (isHeavyBinaryString(entry)) continue
    out[key] =
      entry && typeof entry === 'object' ? stripHeavyKeepingClinicalDrafts(entry) : entry
  }
  return out
}

function normalizeRecord(raw, clinicId) {
  if (!raw || typeof raw !== 'object') return null
  const payloadSource =
    raw.payload && typeof raw.payload === 'object' && !Array.isArray(raw.payload) ? raw.payload : raw
  const syncId = String(raw.syncId ?? payloadSource.syncId ?? payloadSource.id ?? '').trim()
  if (!syncId) return null
  const payloadRaw =
    raw.payload && typeof raw.payload === 'object' && !Array.isArray(raw.payload)
      ? { ...raw.payload }
      : { ...raw }
  // La ficha de un paciente se persiste entera. El corte de 50 KB solo aplica al listado masivo.
  const lightPayload = stripHeavyKeepingClinicalDrafts(payloadRaw)
  const payload = stripClinicalPayloadEvolutionPatientSignatures(lightPayload)
  const updatedAt = String(raw.updatedAt || payload.updatedAt || payload.createdAt || new Date().toISOString())
  const deletedAt = raw.deletedAt || payload.deletedAt || null
  const now = new Date().toISOString()
  return {
    syncId,
    clinicId,
    updatedAt,
    serverUpdatedAt: now,
    deletedAt: deletedAt ? String(deletedAt) : null,
    payload,
  }
}

function findPatientKey(patients, record) {
  if (patients[record.syncId]) return record.syncId
  const documentNumber = String(record.payload?.documentNumber ?? '').trim()
  if (!documentNumber) return record.syncId
  for (const [syncId, existing] of Object.entries(patients)) {
    if (String(existing?.payload?.documentNumber ?? '').trim() === documentNumber) {
      return syncId
    }
  }
  return record.syncId
}

function extractBase64(raw) {
  if (!raw || typeof raw !== 'object') return ''
  if (typeof raw.dataBase64 === 'string' && raw.dataBase64) return raw.dataBase64
  if (typeof raw.payload?.dataBase64 === 'string' && raw.payload.dataBase64) {
    return raw.payload.dataBase64
  }
  return ''
}

function attachmentPatientSyncId(record, raw) {
  const payload = record?.payload && typeof record.payload === 'object' ? record.payload : {}
  const fromRaw =
    raw && typeof raw === 'object'
      ? raw.patientSyncId || raw.patientId || raw.payload?.patientSyncId || raw.payload?.patientId
      : ''
  return String(
    payload.patientSyncId || payload.patientId || fromRaw || 'sin-paciente',
  ).trim() || 'sin-paciente'
}

/**
 * Solo metadatos ligeros: binarios van por POST /google-drive/upload (stream).
 * Ignora cualquier Base64 residual del cliente para no saturar RAM en t3.micro.
 */
async function persistAttachmentBinary(_clinicId, record, raw, _aliasIds = []) {
  const payload = stripHeavyBinaryFields(
    record.payload && typeof record.payload === 'object' ? record.payload : {},
  )
  const prevId = String(
    payload.driveFileId ||
      raw?.driveFileId ||
      raw?.payload?.driveFileId ||
      '',
  ).trim()
  if (prevId) {
    return {
      ...record,
      payload: {
        ...payload,
        storageBackend: 'google_drive',
        driveFileId: prevId,
        driveWebViewLink:
          payload.driveWebViewLink || payload.webViewLink || raw?.webViewLink || undefined,
        hasBinary: true,
      },
    }
  }
  return {
    ...record,
    payload: {
      ...payload,
      hasBinary: Boolean(payload.hasBinary),
    },
  }
}

async function readAttachmentBytesFromDrive(clinicIds, record) {
  const ids = Array.isArray(clinicIds) ? clinicIds : [clinicIds]
  const payload = record?.payload && typeof record.payload === 'object' ? record.payload : {}
  const driveFileId = String(payload.driveFileId || '').trim()
  if (!driveFileId) return null

  let lastDriveRequired = null
  for (const clinicId of ids) {
    if (!clinicId) continue
    try {
      const bytes = await readAttachmentBytes(clinicId, driveFileId, { driveFileId })
      if (bytes && bytes.length) return bytes
    } catch (error) {
      if (isGoogleDriveRequiredError(error)) {
        lastDriveRequired = error
        continue
      }
      throw error
    }
  }
  if (lastDriveRequired) throw lastDriveRequired
  return null
}

async function hydrateAttachment(clinicIds, record, includeBlobs) {
  if (!record) return null
  const payload = record.payload && typeof record.payload === 'object' ? record.payload : {}
  const hasBinary = Boolean(payload.hasBinary || payload.driveFileId)
  if (!includeBlobs) {
    return {
      ...record,
      payload: {
        ...payload,
        dataBase64: undefined,
        hasBinary,
        storageBackend: payload.driveFileId ? 'google_drive' : payload.storageBackend,
        driveFileId: payload.driveFileId || undefined,
      },
    }
  }
  if (!payload.driveFileId) {
    return {
      ...record,
      payload: { ...payload, dataBase64: undefined, hasBinary: Boolean(payload.hasBinary) },
    }
  }
  try {
    const bytes = await readAttachmentBytesFromDrive(clinicIds, record)
    if (!bytes) {
      return {
        ...record,
        payload: {
          ...payload,
          storageBackend: 'google_drive',
          dataBase64: undefined,
          hasBinary: true,
        },
      }
    }
    return {
      ...record,
      payload: {
        ...payload,
        storageBackend: 'google_drive',
        driveFileId: payload.driveFileId,
        dataBase64: bufferToBase64(bytes),
        byteLength: bytes.length,
        hasBinary: true,
      },
    }
  } catch (error) {
    // El pull completo no debe caerse: el GET /attachment devolverá 428 si aplica.
    if (isGoogleDriveRequiredError(error)) {
      return {
        ...record,
        payload: {
          ...payload,
          storageBackend: 'google_drive',
          dataBase64: undefined,
          hasBinary: true,
        },
      }
    }
    throw error
  }
}

let writeChain = Promise.resolve()

/** Caché en memoria del JSON parseado (evita re-leer ~83MB en cada /pull). */
let storeCache = {
  mtimeMs: 0,
  size: 0,
  store: null,
}

/** Caché del índice liviano (patients, appointments y metadatos de exámenes). */
let metaCache = {
  mtimeMs: 0,
  size: 0,
  meta: null,
}

function invalidateStoreCache() {
  storeCache = { mtimeMs: 0, size: 0, store: null }
}

function invalidateMetaCache() {
  metaCache = { mtimeMs: 0, size: 0, meta: null }
}

function listedDiagnosticAids(clinic) {
  return Object.values(clinic?.diagnosticAids || {})
    .filter(Boolean)
    .map((record) => lightweightDiagnosticAidRecord(record))
    .filter((record) => record && record.syncId)
}

function metaDiagnosticAids(clinic) {
  const out = {}
  for (const record of listedDiagnosticAids(clinic)) {
    out[record.syncId] = record
  }
  return out
}

function buildMetaFromStore(store, sourceStat = null) {
  const clinicsIn = store?.clinics && typeof store.clinics === 'object' ? store.clinics : {}
  const clinics = {}
  for (const [clinicId, clinic] of Object.entries(clinicsIn)) {
    if (!clinic || typeof clinic !== 'object') continue
    clinics[clinicId] = {
      patients:
        clinic.patients && typeof clinic.patients === 'object' ? clinic.patients : {},
      appointments:
        clinic.appointments && typeof clinic.appointments === 'object'
          ? clinic.appointments
          : {},
      diagnosticAids: metaDiagnosticAids(clinic),
    }
  }
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    sourceMtimeMs: sourceStat?.mtimeMs ?? 0,
    sourceSize: sourceStat?.size ?? 0,
    clinics,
  }
}

async function writeMetaFile(meta) {
  const { writeFile, rename } = await import('node:fs/promises')
  const tmp = `${META_FILE}.tmp-${process.pid}`
  await writeFile(tmp, JSON.stringify(meta), 'utf8')
  await rename(tmp, META_FILE)
}

async function loadMetaStore() {
  try {
    const st = await stat(META_FILE)
    if (
      metaCache.meta &&
      metaCache.mtimeMs === st.mtimeMs &&
      metaCache.size === st.size
    ) {
      return metaCache.meta
    }
    const raw = await readFile(META_FILE, 'utf8')
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || !parsed.clinics) return null
    metaCache = { mtimeMs: st.mtimeMs, size: st.size, meta: parsed }
    return parsed
  } catch {
    return null
  }
}

/**
 * Multi-tenant: si falta el índice, reconstruir en proceso hijo con heap alto.
 * NUNCA parsear clinical-sync.json (~83MB) dentro del request HTTP (OOM → 502).
 */
async function ensureMetaStore() {
  const existing = await loadMetaStore()
  if (existing) return existing

  try {
    const { spawnSync } = await import('node:child_process')
    const { fileURLToPath } = await import('node:url')
    const { dirname, join: pathJoin } = await import('node:path')
    const here = dirname(fileURLToPath(import.meta.url))
    const script = pathJoin(here, '../../scripts/build-clinical-sync-meta.cjs')
    console.warn('[Sync] clinical-sync-meta.json ausente — regenerando en proceso hijo…')
    const result = spawnSync(process.execPath, ['--max-old-space-size=1536', script], {
      cwd: pathJoin(here, '../..'),
      env: { ...process.env, CLINICAL_SYNC_PATH: STORE_FILE },
      encoding: 'utf8',
      timeout: 120_000,
    })
    if (result.status !== 0) {
      console.error('[Sync] build-clinical-sync-meta falló:', result.stderr || result.stdout)
    }
  } catch (error) {
    console.error(
      '[Sync] No se pudo regenerar clinical-sync-meta.json:',
      error instanceof Error ? error.message : error,
    )
  }

  invalidateMetaCache()
  return loadMetaStore()
}

export class SyncMetaMissingError extends Error {
  constructor(message = 'clinical-sync-meta.json ausente; no se puede hacer pull slim sin riesgo de OOM') {
    super(message)
    this.name = 'SyncMetaMissingError'
    this.code = 'SYNC_META_MISSING'
  }
}

/** Fusiona patients, appointments y metadatos de exámenes desde el índice (sin drafts/historias). */
function mergeMetaClinicBuckets(meta, ids) {
  const clinic = emptyClinic()
  const clinics = meta?.clinics && typeof meta.clinics === 'object' ? meta.clinics : {}
  for (const id of ids) {
    const bucket = clinics[id]
    if (!bucket || typeof bucket !== 'object') continue
    for (const [syncId, record] of Object.entries(bucket.patients || {})) {
      if (!record) continue
      const prev = clinic.patients[syncId]
      clinic.patients[syncId] = prev ? (stamp(record) >= stamp(prev) ? record : prev) : record
    }
    for (const [syncId, record] of Object.entries(bucket.appointments || {})) {
      if (!record) continue
      const prev = clinic.appointments[syncId]
      clinic.appointments[syncId] = prev
        ? stamp(record) >= stamp(prev)
          ? record
          : prev
        : record
    }
    for (const [syncId, record] of Object.entries(bucket.diagnosticAids || {})) {
      if (!record) continue
      const prev = clinic.diagnosticAids[syncId]
      clinic.diagnosticAids[syncId] = prev
        ? stamp(record) >= stamp(prev)
          ? record
          : prev
        : record
    }
  }
  return clinic
}

function enqueueWrite(fn) {
  const next = writeChain.then(fn, fn)
  writeChain = next.then(
    () => undefined,
    () => undefined,
  )
  return next
}

/**
 * Disco es la fuente de verdad del sync clínico (writeDurableJsonReplace).
 * Evita merge con Postgres en cada pull (doble memoria / aliases stale).
 */
/** Por encima de esto, un parse en frío en t3.micro (~635 MB heap) suele OOM. */
const CLINICAL_SYNC_COLD_LOAD_WARN_BYTES = 100 * 1024 * 1024

async function loadStore() {
  try {
    const st = await stat(STORE_FILE)
    if (
      storeCache.store &&
      storeCache.mtimeMs === st.mtimeMs &&
      storeCache.size === st.size
    ) {
      return storeCache.store
    }
    // Sin caché: no intentar parsear 160MB+ (mata Node → 502 en Drive).
    if (!storeCache.store && st.size > CLINICAL_SYNC_COLD_LOAD_WARN_BYTES) {
      const err = new Error(
        `clinical-sync.json (${Math.round(st.size / (1024 * 1024))} MB) supera el límite de carga en frío. Ejecute dedup/harden.`,
      )
      err.code = 'CLINICAL_SYNC_TOO_LARGE'
      err.status = 503
      console.error('[clinical-sync]', err.message)
      throw err
    }
    const raw = await readFile(STORE_FILE, 'utf8')
    const parsed = JSON.parse(raw)
    const store = mergeClinicalStores(
      emptyStore(),
      parsed && typeof parsed === 'object' ? parsed : emptyStore(),
    )
    storeCache = { mtimeMs: st.mtimeMs, size: st.size, store }
    return store
  } catch (error) {
    if (error?.code === 'CLINICAL_SYNC_TOO_LARGE') throw error
    invalidateStoreCache()
    try {
      const st = await stat(STORE_FILE)
      if (st.size > CLINICAL_SYNC_COLD_LOAD_WARN_BYTES) {
        const err = new Error(
          `clinical-sync.json (${Math.round(st.size / (1024 * 1024))} MB) no se puede recuperar en frío sin OOM.`,
        )
        err.code = 'CLINICAL_SYNC_TOO_LARGE'
        err.status = 503
        throw err
      }
    } catch (inner) {
      if (inner?.code === 'CLINICAL_SYNC_TOO_LARGE') throw inner
    }
    const parsed = await readDurableJsonWithMerge(
      STORE_FILE,
      emptyStore(),
      STORE_KEY,
      mergeClinicalStores,
    )
    const store = mergeClinicalStores(emptyStore(), parsed)
    storeCache = { mtimeMs: 0, size: 0, store }
    return store
  }
}

async function saveStore(store) {
  // Antes de disco/Postgres: purgar Base64/DataURL >50k, claves binarias y clinicalDraft pesados.
  // Reemplazo completo en app_json_store: un merge LWW con un documento stale
  // reintroducía aliases (UUID/email) y volvía a inflar clinical-sync.json.
  invalidateStoreCache()
  invalidateMetaCache()
  const base = store && typeof store === 'object' ? store : emptyStore()
  const sanitized = stripHeavyKeepingClinicalDrafts(base)
  await writeDurableJsonReplace(STORE_FILE, sanitized, STORE_KEY)
  // Re-cache tras escritura para el próximo pull (mtime fresco).
  try {
    const st = await stat(STORE_FILE)
    storeCache = { mtimeMs: st.mtimeMs, size: st.size, store: sanitized }
    const meta = buildMetaFromStore(sanitized, st)
    await writeMetaFile(meta)
    const metaStat = await stat(META_FILE)
    metaCache = { mtimeMs: metaStat.mtimeMs, size: metaStat.size, meta }
  } catch (error) {
    console.error(
      '[Sync] No se pudo escribir clinical-sync-meta.json:',
      error instanceof Error ? error.message : error,
    )
  }
}

/**
 * Una sola fuente de verdad: el cubo canónico.
 * Los alias (email sin prefijo, UUID, superadmin-session) NO se duplican en disco;
 * se fusionan una vez hacia canónico y se eliminan para no multiplicar ~72MB.
 */
function foldAliasesIntoCanonical(store, canonical, aliasIds = []) {
  if (!store.clinics || typeof store.clinics !== 'object') store.clinics = {}
  const ids = scopeIds(canonical, aliasIds)
  const folded = mergeClinicBuckets(store, ids)
  store.clinics[canonical] = folded
  for (const key of Object.keys(store.clinics)) {
    if (key === canonical) continue
    if (!ids.includes(key)) continue
    delete store.clinics[key]
  }
  return folded
}

function replicateAliases(store, canonical, clinic, aliasIds = []) {
  if (!store.clinics || typeof store.clinics !== 'object') store.clinics = {}
  store.clinics[canonical] = clinic
  // Borrar copias legacy; pull/push usan clinicKeyInScope + cubo canónico.
  for (const key of scopeIds(canonical, aliasIds)) {
    if (key === canonical) continue
    if (store.clinics[key]) delete store.clinics[key]
  }
}

/**
 * Vacía el cubo clínico de una clínica (y aliases).
 * Evita que un registro nuevo herede pacientes empujados por error desde otro tenant.
 */
export async function resetClinicClinicalBucket(clinicId, aliasIds = []) {
  const canonical = String(clinicId || '').trim()
  if (!canonical) return { ok: false, error: 'clinicId vacío' }
  return enqueueWrite(async () => {
    const store = await loadStore()
    store.clinics[canonical] = cloneClinic(emptyClinic())
    for (const key of scopeIds(canonical, aliasIds)) {
      if (key !== canonical && store.clinics[key]) delete store.clinics[key]
    }
    await saveStore(store)
    return { ok: true, clinicId: canonical }
  })
}

function rawClinicId(raw) {
  if (!raw || typeof raw !== 'object') return ''
  const payload = raw.payload && typeof raw.payload === 'object' ? raw.payload : null
  return String(raw.clinicId || payload?.clinicId || '').trim()
}

function prepareIncomingClinicalRows(rows, target) {
  if (!Array.isArray(rows)) return []
  return rows.map((raw) => {
    const sanitized = sanitizeClinicalRecordArrays(raw)
    const payload = sanitized?.payload && typeof sanitized.payload === 'object' ? sanitized.payload : {}
    const syncId = String(sanitized?.syncId || payload.syncId || payload.id || '')
    const previous = syncId && target ? target[syncId] : null
    try {
      assertClinicalArrayLimits(previous, sanitized)
    } catch (error) {
      if (isClinicalArrayCircuitError(error)) {
        console.error('[Sync] CIRCUIT OPEN', error.message, error.details || {})
      }
      throw error
    }
    return sanitized
  })
}

function mergeIncomingMap(target, incoming, clinicId, acceptedKey, accepted, aliasIds = []) {
  let count = 0
  for (const raw of Array.isArray(incoming) ? incoming : []) {
    if (!clinicKeyInScope(rawClinicId(raw), clinicId, aliasIds)) {
      accepted.rejected = (accepted.rejected || 0) + 1
      continue
    }
    const record = normalizeRecord(raw, clinicId)
    if (!record) continue
    const prev = target[record.syncId]
    const merged = mergeClinicalEntityRecord(prev, record, acceptedKey)
    if (merged !== prev) {
      target[record.syncId] = merged
      count += 1
    }
  }
  accepted[acceptedKey] = count
}

/** Snapshot completo del cubo canónico más alias legacy (UUID, superadmin-session). */
export async function pullClinicalRecords(clinicId, _since, aliasIds = []) {
  const snapshot = await pullClinicSnapshot(clinicId, aliasIds, { includeBlobs: false })
  return {
    patients: snapshot.patients,
    appointments: snapshot.appointments,
    serverTime: snapshot.serverTime,
  }
}

/**
 * Extrae un objeto JSON balanceado desde `start` (posición del '{').
 * Evita parsear el clinical-sync.json completo (~100MB+) al abrir un valorado.
 */
function extractBalancedJsonObject(raw, start) {
  if (start < 0 || start >= raw.length || raw[start] !== '{') return null
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = start; i < raw.length; i += 1) {
    const ch = raw[i]
    if (inString) {
      if (escaped) {
        escaped = false
        continue
      }
      if (ch === '\\') {
        escaped = true
        continue
      }
      if (ch === '"') inString = false
      continue
    }
    if (ch === '"') {
      inString = true
      continue
    }
    if (ch === '{') depth += 1
    else if (ch === '}') {
      depth -= 1
      if (depth === 0) {
        try {
          return JSON.parse(raw.slice(start, i + 1))
        } catch {
          return null
        }
      }
    }
  }
  return null
}

/** Lectura fría de un solo draft sin JSON.parse del archivo entero. */
async function extractDraftRecordFromFile(patientSyncId) {
  const syncKey = String(patientSyncId || '').trim()
  if (!syncKey) return null
  const draftKey = syncKey.startsWith('draft:') ? syncKey : `draft:${syncKey}`
  const needles = [`"${draftKey}"`, `"${syncKey}"`]
  let raw = ''
  try {
    raw = await readFile(STORE_FILE, 'utf8')
  } catch {
    return null
  }
  for (const needle of needles) {
    let from = 0
    while (from < raw.length) {
      const at = raw.indexOf(needle, from)
      if (at < 0) break
      const colon = raw.indexOf(':', at + needle.length)
      if (colon < 0) break
      let brace = colon + 1
      while (brace < raw.length && /\s/.test(raw[brace])) brace += 1
      if (raw[brace] === '{') {
        const parsed = extractBalancedJsonObject(raw, brace)
        if (parsed && typeof parsed === 'object') {
          const payload =
            parsed.payload && typeof parsed.payload === 'object' ? parsed.payload : parsed
          const ps = String(payload?.patientSyncId || payload?.patientId || parsed.syncId || '').trim()
          if (
            ps === syncKey ||
            ps === draftKey ||
            String(parsed.syncId || '') === draftKey ||
            String(parsed.syncId || '') === syncKey
          ) {
            return parsed
          }
        }
      }
      from = at + needle.length
    }
  }
  return null
}

function findDraftInClinicMaps(clinic, syncKey, draftKey) {
  return (
    clinic.drafts?.[draftKey] ||
    clinic.drafts?.[syncKey] ||
    Object.values(clinic.drafts || {}).find((row) => {
      const payload = row?.payload && typeof row.payload === 'object' ? row.payload : row
      const ps = String(payload?.patientSyncId || payload?.patientId || '').trim()
      return ps === syncKey || `draft:${ps}` === draftKey
    }) ||
    null
  )
}

/**
 * Un solo borrador por patientSyncId (p. ej. al abrir Pacientes Valorados).
 * Evita serializar los ~31 MB de drafts en el pull global.
 * Preferir caché en memoria; si el JSON es demasiado grande para parse frío, extrae por clave.
 */
export async function pullPatientDraft(clinicId, patientSyncId, aliasIds = []) {
  const syncKey = String(patientSyncId || '').trim()
  if (!syncKey) return null
  const ids = scopeIds(clinicId, aliasIds)
  if (ids.length === 0) return null
  const draftKey = syncKey.startsWith('draft:') ? syncKey : `draft:${syncKey}`

  let record = null
  if (storeCache.store) {
    try {
      const clinic = mergeClinicBuckets(storeCache.store, ids)
      record = findDraftInClinicMaps(clinic, syncKey, draftKey)
    } catch {
      record = null
    }
  }

  if (!record) {
    try {
      const store = await loadStore()
      const clinic = mergeClinicBuckets(store, ids)
      record = findDraftInClinicMaps(clinic, syncKey, draftKey)
    } catch (error) {
      if (error?.code !== 'CLINICAL_SYNC_TOO_LARGE') throw error
      record = await extractDraftRecordFromFile(syncKey)
    }
  }

  if (!record) {
    record = await extractDraftRecordFromFile(syncKey)
  }
  if (!record) return null
  // Un solo paciente: clinicalDraft y valuationDraft salen íntegros (60 KB o 300 KB).
  return deliverSinglePatientRecord(record)
}

function deliverSinglePatientRecord(record) {
  if (!record || typeof record !== 'object') return record
  const payload =
    record.payload && typeof record.payload === 'object' && !Array.isArray(record.payload)
      ? record.payload
      : null
  if (!payload) return record
  const keptDraft = payload.clinicalDraft
  const keptValuation = payload.valuationDraft
  const stripped = stripHeavyBinaryFields({
    ...payload,
    clinicalDraft: undefined,
    valuationDraft: undefined,
  })
  if ('clinicalDraft' in payload) stripped.clinicalDraft = keptDraft ?? null
  if ('valuationDraft' in payload) stripped.valuationDraft = keptValuation ?? null
  return { ...record, payload: stripped }
}

function recordBelongsToPatient(record, syncKey) {
  const payload = record?.payload && typeof record.payload === 'object' ? record.payload : {}
  const ids = [record?.syncId, payload.patientSyncId, payload.patientId, payload.syncId]
  return ids.some((value) => {
    const text = String(value || '').trim()
    return text === syncKey || text === `draft:${syncKey}`
  })
}

/**
 * Paquete de una ficha: borrador íntegro + historias firmadas + odontograma + exámenes.
 * No aplica el corte de 50 KB. Las historias firmadas se devuelven tal cual (append-only).
 */
export async function pullPatientChart(clinicId, patientSyncId, aliasIds = []) {
  const syncKey = String(patientSyncId || '').trim()
  const draft = await pullPatientDraft(clinicId, syncKey, aliasIds)
  const ids = scopeIds(clinicId, aliasIds)
  let clinic = null
  if (storeCache.store && ids.length) {
    try {
      clinic = mergeClinicBuckets(storeCache.store, ids)
    } catch {
      clinic = null
    }
  }
  if (!clinic && ids.length) {
    try {
      const store = await loadStore()
      clinic = mergeClinicBuckets(store, ids)
    } catch (error) {
      if (error?.code !== 'CLINICAL_SYNC_TOO_LARGE') throw error
    }
  }
  const pick = (bucket) =>
    Object.values(clinic?.[bucket] || {}).filter(
      (record) => record && recordBelongsToPatient(record, syncKey),
    )
  return {
    draft: draft ? deliverSinglePatientRecord(draft) : null,
    clinicalRecords: clinic ? pick('clinicalRecords').map((record) => deliverSinglePatientRecord(record)) : [],
    odontograms: clinic ? pick('odontograms') : [],
    diagnosticAids: clinic ? pick('diagnosticAids').map((record) => lightweightDiagnosticAidRecord(record)).filter(Boolean) : [],
  }
}

/**
 * Snapshot del cubo canónico + aliases.
 *
 * options.slim / includeBlobs===false → pacientes, citas y metadatos de exámenes.
 * Esos metadatos son livianos (sin base64). Historias y drafts siguen fuera del slim
 * para no serializar ~45MB+ en t3.micro.
 * El cliente (login) ya hace pull full=0 y luego full=1 en segundo plano.
 */
export async function pullClinicSnapshot(clinicId, aliasIds = [], options = {}) {
  const includeBlobs = options.includeBlobs === true
  const slim =
    options.slim === true ||
    (options.slim !== false && options.includeBlobs === false)
  const ids = scopeIds(clinicId, aliasIds)
  const serverTime = new Date().toISOString()
  const empty = {
    patients: [],
    appointments: [],
    clinicalRecords: [],
    odontograms: [],
    diagnosticAids: [],
    attachments: [],
    drafts: [],
    sync_queue: [],
    serverTime,
    slim: Boolean(slim),
  }
  if (ids.length === 0) return empty

  // Metadata-only: lee índice liviano. NUNCA parsea el JSON de 83MB.
  // diagnosticAids aquí son solo metadatos (driveFileId, nombre, hash); el binario queda en Drive.
  if (slim) {
    const meta = await ensureMetaStore()
    if (!meta) {
      throw new SyncMetaMissingError()
    }
    const clinic = mergeMetaClinicBuckets(meta, ids)
    try {
      const { mergeMirroredPatients } = await import('./clinicPatientMirror.js')
      clinic.patients = await mergeMirroredPatients(clinicId, clinic.patients)
    } catch (error) {
      console.error(
        '[Sync] No se pudo leer el espejo Postgres de pacientes:',
        error instanceof Error ? error.message : error,
      )
    }
    return {
      ...empty,
      patients: Object.values(clinic.patients).filter(Boolean),
      appointments: Object.values(clinic.appointments).filter(Boolean),
      diagnosticAids: listedDiagnosticAids(clinic),
      slim: true,
    }
  }

  const store = await loadStore()
  const clinic = mergeClinicBuckets(store, ids)
  try {
    const { mergeMirroredPatients } = await import('./clinicPatientMirror.js')
    clinic.patients = await mergeMirroredPatients(clinicId, clinic.patients)
  } catch (error) {
    console.error(
      '[Sync] No se pudo leer el espejo Postgres de pacientes:',
      error instanceof Error ? error.message : error,
    )
  }

  const patients = Object.values(clinic.patients).filter(Boolean)
  const appointments = Object.values(clinic.appointments).filter(Boolean)

  const attachments = []
  for (const record of Object.values(clinic.attachments).filter(Boolean)) {
    attachments.push(await hydrateAttachment(ids, record, includeBlobs))
  }
  const syncQueue = []
  for (const record of Object.values(clinic.sync_queue).filter(Boolean)) {
    syncQueue.push(await hydrateAttachment(ids, record, includeBlobs))
  }

  // Listado masivo: el corte de 50 KB solo aquí. La ficha de un paciente no pasa por esta función.
  return omitHeavyClinicalDraftForms({
    patients,
    appointments,
    clinicalRecords: Object.values(clinic.clinicalRecords).filter(Boolean),
    odontograms: Object.values(clinic.odontograms).filter(Boolean),
    diagnosticAids: listedDiagnosticAids(clinic),
    attachments,
    drafts: [],
    sync_queue: syncQueue,
    serverTime,
    slim: false,
  })
}

export async function pushClinicalRecords(clinicId, patients = [], appointments = [], aliasIds = []) {
  const result = await pushClinicSnapshot(
    clinicId,
    { patients, appointments },
    aliasIds,
  )
  return {
    accepted: {
      patients: result.accepted.patients,
      appointments: result.accepted.appointments,
      rejected: result.accepted.rejected || 0,
      patientSyncIds: result.accepted.patientSyncIds || [],
      appointmentSyncIds: result.accepted.appointmentSyncIds || [],
    },
    serverTime: result.serverTime,
  }
}

export async function pushClinicSnapshot(clinicId, body = {}, aliasIds = []) {
  const canonical = String(clinicId || '').trim()
  const emptyAccepted = {
    patients: 0,
    appointments: 0,
    clinicalRecords: 0,
    odontograms: 0,
    diagnosticAids: 0,
    attachments: 0,
    drafts: 0,
    sync_queue: 0,
    rejected: 0,
    patientSyncIds: [],
    appointmentSyncIds: [],
  }
  if (!canonical) {
    return { accepted: emptyAccepted, serverTime: new Date().toISOString() }
  }

  // Binarios fuera. El borrador de cada paciente se queda entero; las listas se deduplican abajo.
  const safeBody = stripHeavyKeepingClinicalDrafts(body && typeof body === 'object' ? body : {})

  return enqueueWrite(async () => {
    const store = await loadStore()
    const clinic = mergeClinicBuckets(store, scopeIds(canonical, aliasIds))
    const accepted = { ...emptyAccepted }
    const body = safeBody

    for (const raw of Array.isArray(body.patients) ? body.patients : []) {
      if (!clinicKeyInScope(rawClinicId(raw), canonical, aliasIds)) {
        accepted.rejected += 1
        continue
      }
      const record = normalizeRecord(raw, canonical)
      if (!record) continue
      const key = findPatientKey(clinic.patients, record)
      const canonicalRecord = key === record.syncId ? record : { ...record, syncId: key }
      const prev = clinic.patients[key]
      if (!prev || stamp(canonicalRecord) >= stamp(prev)) {
        clinic.patients[key] = sellarAperturaPaciente(prev, canonicalRecord)
        accepted.patients += 1
        accepted.patientSyncIds.push(key)
        if (record.syncId && record.syncId !== key) accepted.patientSyncIds.push(record.syncId)
      } else {
        // Ya estaba en el servidor: cuenta como retenido para no dejar pendingSync falso.
        accepted.patientSyncIds.push(key)
        if (record.syncId && record.syncId !== key) accepted.patientSyncIds.push(record.syncId)
      }
    }

    mergeIncomingMap(clinic.appointments, body.appointments, canonical, 'appointments', accepted, aliasIds)
    if (Array.isArray(body.appointments)) {
      for (const raw of body.appointments) {
        const record = normalizeRecord(raw, canonical)
        if (!record) continue
        if (!clinicKeyInScope(rawClinicId(raw), canonical, aliasIds)) continue
        if (clinic.appointments[record.syncId]) {
          accepted.appointmentSyncIds.push(record.syncId)
        }
      }
    }
    body.clinicalRecords = prepareIncomingClinicalRows(body.clinicalRecords, clinic.clinicalRecords)
    body.drafts = prepareIncomingClinicalRows(body.drafts, clinic.drafts)
    mergeIncomingMap(clinic.clinicalRecords, body.clinicalRecords, canonical, 'clinicalRecords', accepted, aliasIds)
    mergeIncomingMap(clinic.odontograms, body.odontograms, canonical, 'odontograms', accepted, aliasIds)
    mergeIncomingMap(clinic.diagnosticAids, body.diagnosticAids, canonical, 'diagnosticAids', accepted, aliasIds)
    mergeIncomingMap(clinic.drafts, body.drafts, canonical, 'drafts', accepted, aliasIds)

    const queueItems = [
      ...(Array.isArray(body.sync_queue) ? body.sync_queue : []),
      ...(Array.isArray(body.syncQueue) ? body.syncQueue : []),
      ...(Array.isArray(body.attachments) ? body.attachments : []),
    ]

    for (const raw of queueItems) {
      if (!clinicKeyInScope(rawClinicId(raw), canonical, aliasIds)) {
        accepted.rejected += 1
        continue
      }
      const record = normalizeRecord(raw, canonical)
      if (!record) continue
      const withBinary = await persistAttachmentBinary(canonical, record, raw, aliasIds)
      const isAttachment =
        String(raw.entityType || raw.payload?.entityType || record.payload.entityType || '').includes(
          'diagnostic',
        ) ||
        Boolean(record.payload.fileHash || record.payload.aidId || extractBase64(raw))
      const target = isAttachment ? clinic.attachments : clinic.sync_queue
      const acceptedKey = isAttachment ? 'attachments' : 'sync_queue'
      const prev = target[withBinary.syncId]
      if (!prev || stamp(withBinary) >= stamp(prev)) {
        target[withBinary.syncId] = withBinary
        clinic.sync_queue[withBinary.syncId] = {
          ...withBinary,
          payload: { ...withBinary.payload, status: 'synced' },
        }
        accepted[acceptedKey] += 1
        if (acceptedKey !== 'sync_queue') accepted.sync_queue += 1
      }
    }

    replicateAliases(store, canonical, clinic, aliasIds)
    await saveStore(store)
    try {
      const { mirrorClinicPatients } = await import('./clinicPatientMirror.js')
      await mirrorClinicPatients(canonical, Object.values(clinic.patients))
    } catch (error) {
      console.error(
        '[Sync] El espejo Postgres de pacientes no se actualizó:',
        error instanceof Error ? error.message : error,
      )
    }
    // CQRS: el write path ya persistió. El read model se actualiza en background.
    emitSnapshotPushed(canonical, body, accepted)
    return {
      accepted,
      serverTime: new Date().toISOString(),
    }
  })
}

function attachmentMatches(record, query) {
  const payload = record?.payload && typeof record.payload === 'object' ? record.payload : {}
  const id = String(query.id || query.aidId || query.fileId || '').trim()
  const fileHash = String(query.fileHash || query.hash || '').trim().toLowerCase()
  const patientId = String(query.patientId || query.patientSyncId || '').trim()
  const encounterId = String(query.encounterId || query.evolutionId || '').trim()

  const ids = [
    record?.syncId,
    payload.id,
    payload.aidId,
    payload.blobId,
    payload.fileHash,
  ].map((value) => String(value || '').trim()).filter(Boolean)

  if (id && ids.includes(id)) return true
  if (fileHash && String(payload.fileHash || '').trim().toLowerCase() === fileHash) return true
  if (patientId && encounterId) {
    const samePatient =
      String(payload.patientId || '') === patientId || String(payload.patientSyncId || '') === patientId
    const sameEncounter =
      String(payload.encounterId || '') === encounterId || String(payload.evolutionId || '') === encounterId
    if (samePatient && sameEncounter && (!fileHash || String(payload.fileHash || '').trim().toLowerCase() === fileHash)) {
      return true
    }
  }
  if (patientId && !encounterId && fileHash) {
    const samePatient =
      String(payload.patientId || '') === patientId || String(payload.patientSyncId || '') === patientId
    if (samePatient && String(payload.fileHash || '').trim().toLowerCase() === fileHash) return true
  }
  return false
}

export async function findClinicAttachment(clinicId, query = {}, aliasIds = []) {
  const ids = scopeIds(clinicId, aliasIds)
  if (ids.length === 0) return null
  const store = await loadStore()
  const clinic = mergeClinicBuckets(store, ids)
  const pools = [...Object.values(clinic.attachments), ...Object.values(clinic.sync_queue)]
  let match = pools.find((record) => attachmentMatches(record, query))
  if (!match) {
    const aid = Object.values(clinic.diagnosticAids).find((record) => attachmentMatches(record, query))
    if (aid) {
      match =
        pools.find((record) => {
          const payload = record?.payload && typeof record.payload === 'object' ? record.payload : {}
          return (
            record.syncId === aid.syncId ||
            payload.aidId === aid.syncId ||
            payload.aidId === aid.payload?.id ||
            payload.id === aid.payload?.id
          )
        }) || aid
    }
  }
  if (!match) return null
  const payload = match.payload && typeof match.payload === 'object' ? match.payload : {}
  const driveFileId = String(payload.driveFileId || '').trim()
  if (!driveFileId) {
    return {
      ...match,
      payload: { ...payload, dataBase64: undefined, hasBinary: Boolean(payload.hasBinary) },
    }
  }
  // Bajo demanda: exige Drive conectado (428 si falta).
  const bytes = await readAttachmentBytesFromDrive(ids, match)
  if (!bytes) {
    return {
      ...match,
      payload: {
        ...payload,
        storageBackend: 'google_drive',
        dataBase64: undefined,
        hasBinary: true,
      },
    }
  }
  return {
    ...match,
    payload: {
      ...payload,
      storageBackend: 'google_drive',
      driveFileId,
      dataBase64: bufferToBase64(bytes),
      byteLength: bytes.length,
      hasBinary: true,
    },
  }
}

export { isGoogleDriveRequiredError, GoogleDriveRequiredError } from './clinicAttachmentStore.js'
