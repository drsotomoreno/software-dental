import { join } from 'node:path'
import { config } from '../config.js'
import {
  base64ToBuffer,
  bufferToBase64,
  readAttachmentBytes,
  writeAttachmentBytes,
} from './clinicAttachmentStore.js'
import { readDurableJsonWithMerge, writeDurableJsonWithMerge } from './durableStore.js'

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

function mergeRecordMaps(left = {}, right = {}) {
  const out = { ...left }
  for (const [syncId, record] of Object.entries(right)) {
    if (!record || typeof record !== 'object') continue
    const prev = out[syncId]
    if (!prev || stamp(record) >= stamp(prev)) {
      out[syncId] = record
    }
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
      merged[key] = mergeRecordMaps(merged[key], bucket[key])
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
      merged[key] = mergeRecordMaps(a[key], b[key])
    }
    clinics[clinicId] = merged
  }
  return { clinics }
}

function normalizeRecord(raw, clinicId) {
  if (!raw || typeof raw !== 'object') return null
  const payloadSource =
    raw.payload && typeof raw.payload === 'object' && !Array.isArray(raw.payload) ? raw.payload : raw
  const syncId = String(raw.syncId ?? payloadSource.syncId ?? payloadSource.id ?? '').trim()
  if (!syncId) return null
  const payload =
    raw.payload && typeof raw.payload === 'object' && !Array.isArray(raw.payload)
      ? { ...raw.payload }
      : { ...raw }
  delete payload.dataBase64
  delete payload.data
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

async function persistAttachmentBinary(clinicId, record, raw) {
  const base64 = extractBase64(raw)
  const buffer = base64ToBuffer(base64)
  if (!buffer) return record
  await writeAttachmentBytes(clinicId, record.syncId, buffer)
  return {
    ...record,
    payload: {
      ...record.payload,
      byteLength: buffer.length,
      hasBinary: true,
    },
  }
}

async function hydrateAttachment(clinicId, record, includeBlobs) {
  if (!record) return null
  if (!includeBlobs) {
    return {
      ...record,
      payload: { ...record.payload, dataBase64: undefined, hasBinary: Boolean(record.payload?.hasBinary) },
    }
  }
  const bytes = await readAttachmentBytes(clinicId, record.syncId)
  if (!bytes) return record
  return {
    ...record,
    payload: {
      ...record.payload,
      dataBase64: bufferToBase64(bytes),
      byteLength: bytes.length,
      hasBinary: true,
    },
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
  await writeDurableJsonWithMerge(STORE_FILE, store, STORE_KEY, mergeClinicalStores)
}

function replicateAliases(store, canonical, clinic, aliasIds) {
  store.clinics[canonical] = clinic
  for (const key of scopeIds(canonical, aliasIds)) {
    if (key === canonical) continue
    store.clinics[key] = cloneClinic(clinic)
  }
}

function mergeIncomingMap(target, incoming, clinicId, acceptedKey, accepted) {
  let count = 0
  for (const raw of Array.isArray(incoming) ? incoming : []) {
    const record = normalizeRecord(raw, clinicId)
    if (!record) continue
    const prev = target[record.syncId]
    if (!prev || stamp(record) >= stamp(prev)) {
      target[record.syncId] = record
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
  const attachments = []
  for (const record of Object.values(clinic.attachments).filter(Boolean)) {
    attachments.push(await hydrateAttachment(clinicId, record, includeBlobs))
  }
  return {
    patients: Object.values(clinic.patients).filter(Boolean),
    appointments: Object.values(clinic.appointments).filter(Boolean),
    clinicalRecords: Object.values(clinic.clinicalRecords).filter(Boolean),
    odontograms: Object.values(clinic.odontograms).filter(Boolean),
    diagnosticAids: Object.values(clinic.diagnosticAids).filter(Boolean),
    attachments,
    drafts: Object.values(clinic.drafts).filter(Boolean),
    sync_queue: Object.values(clinic.sync_queue).filter(Boolean),
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
  }
  if (!canonical) {
    return { accepted: emptyAccepted, serverTime: new Date().toISOString() }
  }

  return enqueueWrite(async () => {
    const store = await loadStore()
    const clinic = mergeClinicBuckets(store, scopeIds(canonical, aliasIds))
    const accepted = { ...emptyAccepted }

    for (const raw of Array.isArray(body.patients) ? body.patients : []) {
      const record = normalizeRecord(raw, canonical)
      if (!record) continue
      const key = findPatientKey(clinic.patients, record)
      const canonicalRecord = key === record.syncId ? record : { ...record, syncId: key }
      const prev = clinic.patients[key]
      if (!prev || stamp(canonicalRecord) >= stamp(prev)) {
        clinic.patients[key] = canonicalRecord
        accepted.patients += 1
      }
    }

    mergeIncomingMap(clinic.appointments, body.appointments, canonical, 'appointments', accepted)
    mergeIncomingMap(clinic.clinicalRecords, body.clinicalRecords, canonical, 'clinicalRecords', accepted)
    mergeIncomingMap(clinic.odontograms, body.odontograms, canonical, 'odontograms', accepted)
    mergeIncomingMap(clinic.diagnosticAids, body.diagnosticAids, canonical, 'diagnosticAids', accepted)
    mergeIncomingMap(clinic.drafts, body.drafts, canonical, 'drafts', accepted)

    const queueItems = [
      ...(Array.isArray(body.sync_queue) ? body.sync_queue : []),
      ...(Array.isArray(body.syncQueue) ? body.syncQueue : []),
      ...(Array.isArray(body.attachments) ? body.attachments : []),
    ]

    for (const raw of queueItems) {
      const record = normalizeRecord(raw, canonical)
      if (!record) continue
      const withBinary = await persistAttachmentBinary(canonical, record, raw)
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
    return {
      accepted,
      serverTime: new Date().toISOString(),
    }
  })
}

function attachmentMatches(record, query) {
  const payload = record?.payload && typeof record.payload === 'object' ? record.payload : {}
  const id = String(query.id || query.aidId || '').trim()
  const fileHash = String(query.fileHash || query.hash || '').trim().toLowerCase()
  const patientId = String(query.patientId || '').trim()
  const encounterId = String(query.encounterId || query.evolutionId || '').trim()

  const ids = [
    record?.syncId,
    payload.id,
    payload.aidId,
    payload.blobId,
  ].map((value) => String(value || '').trim()).filter(Boolean)

  if (id && ids.includes(id)) return true
  if (fileHash && String(payload.fileHash || '').trim().toLowerCase() === fileHash) return true
  if (patientId && encounterId) {
    const samePatient =
      String(payload.patientId || '') === patientId || String(payload.patientSyncId || '') === patientId
    const sameEncounter = String(payload.encounterId || '') === encounterId
    if (samePatient && sameEncounter && (!fileHash || String(payload.fileHash || '').trim().toLowerCase() === fileHash)) {
      return true
    }
  }
  return false
}

export async function findClinicAttachment(clinicId, query = {}, aliasIds = []) {
  const ids = scopeIds(clinicId, aliasIds)
  if (ids.length === 0) return null
  const store = await loadStore()
  const clinic = mergeClinicBuckets(store, ids)
  const pools = [...Object.values(clinic.attachments), ...Object.values(clinic.sync_queue)]
  const match = pools.find((record) => attachmentMatches(record, query))
  if (!match) return null
  return hydrateAttachment(clinicId, match, true)
}
