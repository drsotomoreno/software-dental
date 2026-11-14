import { join } from 'node:path'
import { config } from '../config.js'
import {
  base64ToBuffer,
  bufferToBase64,
  isGoogleDriveRequiredError,
  readAttachmentBytes,
  writeAttachmentBytes,
} from './clinicAttachmentStore.js'
import { readDurableJsonWithMerge, writeDurableJsonWithMerge } from './durableStore.js'
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
  const payload = stripClinicalPayloadEvolutionPatientSignatures(
    stripHeavyBinaryFields(payloadRaw),
  )
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

function enqueueWrite(fn) {
  const next = writeChain.then(fn, fn)
  writeChain = next.then(
    () => undefined,
    () => undefined,
  )
  return next
}

async function loadStore() {
  const parsed = await readDurableJsonWithMerge(STORE_FILE, emptyStore(), STORE_KEY, mergeClinicalStores)
  return mergeClinicalStores(emptyStore(), parsed)
}

async function saveStore(store) {
  // Antes de disco/Postgres: purgar Base64/DataURL >50k y claves binarias residuales.
  const sanitized = stripHeavyBinaryFields(store && typeof store === 'object' ? store : emptyStore())
  await writeDurableJsonWithMerge(STORE_FILE, sanitized, STORE_KEY, mergeClinicalStores)
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

export async function pullClinicSnapshot(clinicId, aliasIds = [], options = {}) {
  const includeBlobs = options.includeBlobs !== false
  const ids = scopeIds(clinicId, aliasIds)
  const serverTime = new Date().toISOString()
  if (ids.length === 0) {
    return {
      patients: [],
      appointments: [],
      clinicalRecords: [],
      odontograms: [],
      diagnosticAids: [],
      attachments: [],
      drafts: [],
      sync_queue: [],
      serverTime,
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
  const attachments = []
  for (const record of Object.values(clinic.attachments).filter(Boolean)) {
    attachments.push(await hydrateAttachment(ids, record, includeBlobs))
  }
  const syncQueue = []
  for (const record of Object.values(clinic.sync_queue).filter(Boolean)) {
    syncQueue.push(await hydrateAttachment(ids, record, includeBlobs))
  }
  return {
    patients: Object.values(clinic.patients).filter(Boolean),
    appointments: Object.values(clinic.appointments).filter(Boolean),
    clinicalRecords: Object.values(clinic.clinicalRecords).filter(Boolean),
    odontograms: Object.values(clinic.odontograms).filter(Boolean),
    diagnosticAids: Object.values(clinic.diagnosticAids).filter(Boolean),
    attachments,
    drafts: Object.values(clinic.drafts).filter(Boolean),
    sync_queue: syncQueue,
    serverTime,
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

  // Purga Base64/DataURL antes de tocar memoria/disco (t3.micro).
  const safeBody = stripHeavyBinaryFields(body && typeof body === 'object' ? body : {})

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
