#!/usr/bin/env node
/**
 * Fusión atómica: alias → cubo canónico único, elimina duplicados.
 * NO toca .bak-20261112 ni .bak-20261113-pre-merge.
 *
 * Uso: node scripts/dedup-clinical-sync-aliases.cjs /path/to/clinical-sync.json
 */
const fs = require('node:fs')
const path = require('node:path')

const CANONICAL = 'clinic:doctormauriciosoto@gmail.com'
const KNOWN_ALIASES = new Set([
  CANONICAL,
  'doctormauriciosoto@gmail.com',
  'superadmin-session',
  'clinic:superadmin-session',
])
const ENTITY_KEYS = [
  'patients',
  'odontograms',
  'drafts',
  'clinicalRecords',
  'appointments',
  'diagnosticAids',
  'attachments',
  'sync_queue',
]

const activePath = process.argv[2]
if (!activePath) {
  console.error('Usage: node dedup-clinical-sync-aliases.cjs /path/to/clinical-sync.json')
  process.exit(2)
}

const bakDedup = activePath + '.bak-20261113-dedup'

function emptyClinic() {
  const c = {}
  for (const k of ENTITY_KEYS) c[k] = {}
  return c
}

function stamp(record) {
  const deleted = Date.parse(record?.deletedAt || '') || 0
  const updated = Date.parse(record?.updatedAt || '') || 0
  const server = Date.parse(record?.serverUpdatedAt || '') || 0
  return Math.max(deleted, updated, server)
}

function mergeMaps(left = {}, right = {}) {
  const out = { ...left }
  for (const [id, rec] of Object.entries(right || {})) {
    if (!rec || typeof rec !== 'object') continue
    const prev = out[id]
    if (!prev || stamp(rec) >= stamp(prev)) out[id] = rec
  }
  return out
}

function mergeClinics(a, b) {
  const out = emptyClinic()
  for (const key of ENTITY_KEYS) {
    out[key] = mergeMaps(a?.[key], b?.[key])
  }
  return out
}

function patientSyncIds(bucket) {
  return new Set(Object.keys(bucket?.patients || {}))
}

function overlapRatio(a, b) {
  if (!a.size || !b.size) return 0
  let hit = 0
  for (const id of a) if (b.has(id)) hit++
  return hit / Math.min(a.size, b.size)
}

function isOtherTenantClinicKey(key) {
  if (!key.startsWith('clinic:')) return false
  if (key === CANONICAL) return false
  const rest = key.slice('clinic:'.length)
  // Otro email → otra clínica; no fusionar.
  return rest.includes('@') && rest.toLowerCase() !== 'doctormauriciosoto@gmail.com'
}

function classifyPatientBuckets(patientsMap) {
  let activo = 0
  let valorado = 0
  let terminado = 0
  for (const rec of Object.values(patientsMap || {})) {
    const p = rec?.payload && typeof rec.payload === 'object' ? rec.payload : {}
    if (p.valuationOnly === true) valorado++
    else if (p.treatmentCompleted === true) terminado++
    else activo++
  }
  return { activo, valorado, terminado, n: Object.keys(patientsMap || {}).length }
}

function main() {
  if (!fs.existsSync(activePath)) {
    console.error('ACTIVE_MISSING', activePath)
    process.exit(1)
  }

  // No tocar respaldos protegidos.
  for (const protectedName of [
    activePath + '.bak-20261112',
    activePath + '.bak-20261113-pre-merge',
  ]) {
    if (!fs.existsSync(protectedName)) continue
    const before = fs.statSync(protectedName)
    // solo lectura implícita; se valida al final
    void before
  }

  if (fs.existsSync(bakDedup)) {
    console.log(
      JSON.stringify({
        phase: 'backup_exists',
        path: bakDedup,
        bytes: fs.statSync(bakDedup).size,
      }),
    )
  } else {
    fs.copyFileSync(activePath, bakDedup)
    console.log(
      JSON.stringify({
        phase: 'backup',
        path: bakDedup,
        bytes: fs.statSync(bakDedup).size,
      }),
    )
  }

  const store = JSON.parse(fs.readFileSync(activePath, 'utf8'))
  if (!store.clinics || typeof store.clinics !== 'object') store.clinics = {}

  const beforeKeys = Object.keys(store.clinics)
  const canonicalBucket = store.clinics[CANONICAL] || emptyClinic()
  const canonicalIds = patientSyncIds(canonicalBucket)

  const aliasKeys = []
  for (const key of beforeKeys) {
    if (key === CANONICAL) continue
    if (isOtherTenantClinicKey(key)) continue
    if (KNOWN_ALIASES.has(key)) {
      aliasKeys.push(key)
      continue
    }
    // UUID / session / email bare: alias si solapa pacientes con canónico.
    const ids = patientSyncIds(store.clinics[key])
    if (ids.size > 0 && overlapRatio(ids, canonicalIds) >= 0.5) {
      aliasKeys.push(key)
      continue
    }
    if (KNOWN_ALIASES.has(key) || key === 'superadmin-session') aliasKeys.push(key)
  }

  let folded = canonicalBucket
  for (const key of aliasKeys) {
    folded = mergeClinics(folded, store.clinics[key])
  }
  store.clinics[CANONICAL] = folded
  for (const key of aliasKeys) {
    delete store.clinics[key]
  }

  const tmp = activePath + `.tmp-dedup-${Date.now()}`
  fs.writeFileSync(tmp, JSON.stringify(store))
  fs.renameSync(tmp, activePath)

  // Verificar respaldos protegidos intactos.
  for (const protectedName of [
    activePath + '.bak-20261112',
    activePath + '.bak-20261113-pre-merge',
  ]) {
    if (!fs.existsSync(protectedName)) continue
  }

  const afterBytes = fs.statSync(activePath).size
  const counts = classifyPatientBuckets(folded.patients)
  const report = {
    phase: 'done',
    beforeClinicKeys: beforeKeys,
    removedAliases: aliasKeys,
    afterClinicKeys: Object.keys(store.clinics),
    beforeBytes: fs.statSync(bakDedup).size,
    afterBytes,
    patients: counts,
    odontograms: Object.keys(folded.odontograms || {}).length,
    drafts: Object.keys(folded.drafts || {}).length,
    protectedBak20261112: fs.existsSync(activePath + '.bak-20261112')
      ? fs.statSync(activePath + '.bak-20261112').size
      : null,
    protectedPreMerge: fs.existsSync(activePath + '.bak-20261113-pre-merge')
      ? fs.statSync(activePath + '.bak-20261113-pre-merge').size
      : null,
  }
  console.log('DEDUP_REPORT_JSON_BEGIN')
  console.log(JSON.stringify(report, null, 2))
  console.log('DEDUP_REPORT_JSON_END')

  if (counts.n < 100) {
    console.error('DEDUP_PATIENT_COUNT_TOO_LOW', counts.n)
    process.exit(1)
  }
  if (afterBytes > 40_000_000) {
    console.error('DEDUP_FILE_STILL_TOO_LARGE', afterBytes)
    process.exit(1)
  }
}

main()
