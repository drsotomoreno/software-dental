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
/** Índice liviano: solo patients + appointments (pull full=0 sin parsear ~83MB). */
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

function mergeClinicalEntityRecord(prev, next, entityKey) {
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
  // Borradores: sin clinicalDraft >50 KB ni Base64; Dexie local conserva el completo.
  const lightPayload = omitHeavyClinicalDraftForms(stripHeavyBinaryFields(payloadRaw))
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

/** Caché del índice liviano (patients + appointments). */
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

/** Fusiona solo patients/appointments desde el índice meta (sin drafts/historias). */
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
  const sanitized = omitHeavyClinicalDraftForms(stripHeavyBinaryFields(base))
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
 * Un solo borrador por patientSyncId (p. ej. al abrir Pacientes Valorados).
 * Evita serializar los ~31 MB de drafts en el pull global.
 */
export async function pullPatientDraft(clinicId, patientSyncId, aliasIds = []) {
  const syncKey = String(patientSyncId || '').trim()
  if (!syncKey) return null
  const ids = scopeIds(clinicId, aliasIds)
  if (ids.length === 0) return null
  const store = await loadStore()
  const clinic = mergeClinicBuckets(store, ids)
  const draftKey = syncKey.startsWith('draft:') ? syncKey : `draft:${syncKey}`
  const record =
    clinic.drafts?.[draftKey] ||
    clinic.drafts?.[syncKey] ||
    Object.values(clinic.drafts || {}).find((row) => {
      const payload = row?.payload && typeof row.payload === 'object' ? row.payload : row
      const ps = String(payload?.patientSyncId || payload?.patientId || '').trim()
      return ps === syncKey || `draft:${ps}` === draftKey
    }) ||
    null
  if (!record) return null
  return omitHeavyClinicalDraftForms(stripHeavyBinaryFields(record))
}

/**
 * Snapshot del cubo canónico + aliases.
 *
 * options.slim / includeBlobs===false → solo pacientes+citas (~0.06MB).
 * Evita OOM/502 al serializar clinicalRecords+drafts (~45MB+) en t3.micro.
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

  // Metadata-only: lee índice liviano (~pacientes+citas). NUNCA parsea el JSON de 83MB.
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

  // Drafts (~31MB) no van por HTTP: el cliente conserva Dexie local (merge no borra).
  // full=1 prioriza historias/odontogramas (~13MB) sin reventar PM2.
  return {
    patients,
    appointments,
    clinicalRecords: Object.values(clinic.clinicalRecords).filter(Boolean),
    odontograms: Object.values(clinic.odontograms).filter(Boolean),
    diagnosticAids: Object.values(clinic.diagnosticAids).filter(Boolean),
    attachments,
    drafts: [],
    sync_queue: syncQueue,
    serverTime,
    slim: false,
  }
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

  // Purga Base64/DataURL y clinicalDraft >50 KB antes de tocar memoria/disco (t3.micro).
  const safeBody = omitHeavyClinicalDraftForms(
    stripHeavyBinaryFields(body && typeof body === 'object' ? body : {}),
  )

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
