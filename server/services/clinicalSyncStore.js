import { join } from 'node:path'
import { config } from '../config.js'
import { readDurableJsonWithMerge, writeDurableJsonWithMerge } from './durableStore.js'

const STORE_FILE = join(config.dataDir, 'clinical-sync.json')
const STORE_KEY = 'clinical-sync'

function emptyStore() {
  return { clinics: {} }
}

function emptyClinic() {
  return { patients: {}, appointments: {} }
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

function clinicBucket(store, clinicId) {
  const clinics = store?.clinics && typeof store.clinics === 'object' ? store.clinics : {}
  const bucket = clinics[clinicId]
  if (!bucket || typeof bucket !== 'object') return emptyClinic()
  return {
    patients: bucket.patients && typeof bucket.patients === 'object' ? { ...bucket.patients } : {},
    appointments:
      bucket.appointments && typeof bucket.appointments === 'object' ? { ...bucket.appointments } : {},
  }
}

function mergeClinicBuckets(store, clinicIds) {
  const merged = emptyClinic()
  for (const clinicId of clinicIds) {
    if (!clinicId) continue
    const bucket = clinicBucket(store, clinicId)
    merged.patients = mergeRecordMaps(merged.patients, bucket.patients)
    merged.appointments = mergeRecordMaps(merged.appointments, bucket.appointments)
  }
  return merged
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
    clinics[clinicId] = {
      patients: mergeRecordMaps(a.patients, b.patients),
      appointments: mergeRecordMaps(a.appointments, b.appointments),
    }
  }
  return { clinics }
}

function normalizeRecord(raw, clinicId) {
  if (!raw || typeof raw !== 'object') return null
  const syncId = String(raw.syncId ?? '').trim()
  if (!syncId) return null
  const payload =
    raw.payload && typeof raw.payload === 'object' && !Array.isArray(raw.payload) ? raw.payload : {}
  const updatedAt = String(raw.updatedAt || payload.updatedAt || new Date().toISOString())
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

/** Snapshot completo del cubo canónico más alias legacy (UUID, superadmin-session). */
export async function pullClinicalRecords(clinicId, _since, aliasIds = []) {
  const ids = scopeIds(clinicId, aliasIds)
  if (ids.length === 0) {
    return { patients: [], appointments: [], serverTime: new Date().toISOString() }
  }
  const store = await loadStore()
  const clinic = mergeClinicBuckets(store, ids)
  return {
    patients: Object.values(clinic.patients).filter(Boolean),
    appointments: Object.values(clinic.appointments).filter(Boolean),
    serverTime: new Date().toISOString(),
  }
}

export async function pushClinicalRecords(clinicId, patients = [], appointments = [], aliasIds = []) {
  const canonical = String(clinicId || '').trim()
  if (!canonical) {
    return { accepted: { patients: 0, appointments: 0 }, serverTime: new Date().toISOString() }
  }

  return enqueueWrite(async () => {
    const store = await loadStore()
    const clinic = mergeClinicBuckets(store, scopeIds(canonical, aliasIds))
    let acceptedPatients = 0
    let acceptedAppointments = 0

    for (const raw of Array.isArray(patients) ? patients : []) {
      const record = normalizeRecord(raw, canonical)
      if (!record) continue
      const key = findPatientKey(clinic.patients, record)
      const canonicalRecord = key === record.syncId ? record : { ...record, syncId: key }
      const prev = clinic.patients[key]
      if (!prev || stamp(canonicalRecord) >= stamp(prev)) {
        clinic.patients[key] = canonicalRecord
        acceptedPatients += 1
      }
    }

    for (const raw of Array.isArray(appointments) ? appointments : []) {
      const record = normalizeRecord(raw, canonical)
      if (!record) continue
      const prev = clinic.appointments[record.syncId]
      if (!prev || stamp(record) >= stamp(prev)) {
        clinic.appointments[record.syncId] = record
        acceptedAppointments += 1
      }
    }

    store.clinics[canonical] = clinic
    for (const alias of aliasIds) {
      const id = String(alias || '').trim()
      if (id && id !== canonical) delete store.clinics[id]
    }
    await saveStore(store)
    return {
      accepted: { patients: acceptedPatients, appointments: acceptedAppointments },
      serverTime: new Date().toISOString(),
    }
  })
}
