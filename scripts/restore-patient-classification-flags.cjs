#!/usr/bin/env node
/**
 * Restaura banderas de clasificación (valuationOnly, phase, treatmentCompleted)
 * y llaves omitidas del payload paciente desde un bak de solo lectura hacia el
 * clinical-sync.json activo (~3.8 MB, un solo cubo canónico).
 *
 * NO modifica .bak-20261112 / .bak-20261113-pre-merge / .bak-20261113-dedup.
 * NO reintroduce cubos alias.
 *
 * Uso:
 *   node scripts/restore-patient-classification-flags.cjs /path/to/clinical-sync.json
 *   node scripts/restore-patient-classification-flags.cjs /path/to/clinical-sync.json --verify-only
 */
const fs = require('node:fs')

const CANONICAL = 'clinic:doctormauriciosoto@gmail.com'
const FLAG_KEYS = ['valuationOnly', 'phase', 'treatmentCompleted']
const EXPECTED = { activo: 43, valorado: 39, terminado: 24, odontograms: 83, drafts: 80 }
const MAX_ACTIVE_BYTES = 12_000_000

const verifyOnly = process.argv.includes('--verify-only')
const activePath = process.argv.find((arg, i) => i >= 2 && !arg.startsWith('--'))
if (!activePath) {
  console.error(
    'Usage: node restore-patient-classification-flags.cjs /path/to/clinical-sync.json [--verify-only]',
  )
  process.exit(2)
}

function coerceBool(v) {
  if (v === true || v === 1) return true
  if (v === false || v === 0) return false
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase()
    if (s === 'true' || s === '1') return true
    if (s === 'false' || s === '0') return false
  }
  return undefined
}

function isValuatedOnlyPatient(p) {
  if (coerceBool(p.treatmentCompleted) === true) return false
  const raw = p.valuationOnly
  if (raw === true || raw === 'true') return true
  if (raw === false || raw === 'false') return false
  return p.phase === 'VALORACION_RAPIDA'
}

function classify(payload) {
  if (coerceBool(payload.treatmentCompleted) === true) return 'terminado'
  if (isValuatedOnlyPatient(payload)) return 'valorado'
  return 'activo'
}

function stamp(record) {
  const deleted = Date.parse(record?.deletedAt || '') || 0
  const updated = Date.parse(record?.updatedAt || '') || 0
  const server = Date.parse(record?.serverUpdatedAt || '') || 0
  return Math.max(deleted, updated, server)
}

function payloadOf(rec) {
  return rec?.payload && typeof rec.payload === 'object' ? rec.payload : {}
}

function countPatients(map) {
  const out = { activo: 0, valorado: 0, terminado: 0, n: 0 }
  for (const rec of Object.values(map || {})) {
    out[classify(payloadOf(rec))]++
    out.n++
  }
  return out
}

function isEmptyish(value) {
  if (value == null) return true
  if (typeof value === 'string' && value.trim() === '') return true
  if (Array.isArray(value) && value.length === 0) return true
  if (typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0) {
    return true
  }
  return false
}

function classificationScore(payload) {
  let s = 0
  if (Object.prototype.hasOwnProperty.call(payload, 'valuationOnly')) s += 2
  if (Object.prototype.hasOwnProperty.call(payload, 'treatmentCompleted')) s += 2
  if (payload.phase) s += 1
  if (payload.valuationOnly === true || payload.valuationOnly === 'true') s += 3
  if (coerceBool(payload.treatmentCompleted) === true) s += 3
  if (payload.phase === 'VALORACION_RAPIDA') s += 2
  return s
}

function preferPatientRecord(a, b) {
  const sa = classificationScore(payloadOf(a))
  const sb = classificationScore(payloadOf(b))
  if (sa !== sb) return sa > sb ? a : b
  return stamp(a) >= stamp(b) ? a : b
}

/** Pacientes del bak: fusiona cubos por syncId priorizando banderas (solo lectura). */
function collectPatientsFromBak(bakStore, clinicFilter = null) {
  const out = {}
  const clinics = bakStore?.clinics && typeof bakStore.clinics === 'object' ? bakStore.clinics : {}
  for (const [clinicKey, bucket] of Object.entries(clinics)) {
    if (clinicFilter && clinicKey !== clinicFilter) continue
    const patients = bucket?.patients || {}
    for (const [syncId, rec] of Object.entries(patients)) {
      if (!rec || typeof rec !== 'object') continue
      const prev = out[syncId]
      out[syncId] = prev ? preferPatientRecord(prev, rec) : rec
    }
  }
  return out
}

function countsMatchExpected(counts) {
  return (
    counts.activo === EXPECTED.activo &&
    counts.valorado === EXPECTED.valorado &&
    counts.terminado === EXPECTED.terminado
  )
}

function pickSourceBak(activePath) {
  const candidates = [
    activePath + '.bak-20261113-dedup',
    activePath + '.bak-20261112',
  ]
  const reports = []
  let best = null

  for (const path of candidates) {
    if (!fs.existsSync(path)) {
      reports.push({ path, missing: true })
      continue
    }
    const store = JSON.parse(fs.readFileSync(path, 'utf8'))
    const clinicKeys = Object.keys(store.clinics || {})

    // 1) Solo cubo canónico
    const canonicalOnly = collectPatientsFromBak(store, CANONICAL)
    const canonicalCounts = countPatients(canonicalOnly)
    // 2) Fusión de todos los cubos priorizando flags
    const merged = collectPatientsFromBak(store, null)
    const mergedCounts = countPatients(merged)

    const variants = [
      { mode: 'canonical', patients: canonicalOnly, counts: canonicalCounts },
      { mode: 'merged-flags', patients: merged, counts: mergedCounts },
    ]

    // 3) Cada cubo individual si alguno ya tiene 43/39/24
    for (const key of clinicKeys) {
      const one = collectPatientsFromBak(store, key)
      variants.push({ mode: `clinic:${key}`, patients: one, counts: countPatients(one) })
    }

    const matchVariant = variants.find((v) => countsMatchExpected(v.counts))
    reports.push({
      path,
      bytes: fs.statSync(path).size,
      clinicKeys,
      canonicalCounts,
      mergedCounts,
      matchMode: matchVariant ? matchVariant.mode : null,
    })

    if (matchVariant) {
      return {
        path,
        store,
        patients: matchVariant.patients,
        counts: matchVariant.counts,
        mode: matchVariant.mode,
        reports,
      }
    }

    // Guardar el más cercano a 39 valorados
    for (const v of variants) {
      if (!best || Math.abs(v.counts.valorado - EXPECTED.valorado) < Math.abs(best.counts.valorado - EXPECTED.valorado)) {
        best = { path, store, patients: v.patients, counts: v.counts, mode: v.mode, reports }
      }
    }
  }

  if (!best) {
    console.error('NO_SOURCE_BAK', reports)
    process.exit(1)
  }
  best.reports = reports
  return best
}

/**
 * Reaplica flags de clasificación desde bak; rellena llaves omitidas/vacías
 * del payload activo sin pisar valores sustanciales.
 */
function restorePayloadFlags(bakPayload, activePayload) {
  const bak = bakPayload && typeof bakPayload === 'object' ? { ...bakPayload } : {}
  const active = activePayload && typeof activePayload === 'object' ? { ...activePayload } : {}
  const out = { ...active }
  let changed = false

  for (const key of FLAG_KEYS) {
    if (!(key in bak)) continue
    const before = out[key]
    if (before !== bak[key]) {
      out[key] = bak[key]
      changed = true
    }
  }

  for (const [key, value] of Object.entries(bak)) {
    if (FLAG_KEYS.includes(key)) continue
    if (!(key in out) || isEmptyish(out[key])) {
      if (!isEmptyish(value) && out[key] !== value) {
        out[key] = value
        changed = true
      }
    }
  }

  return { payload: out, changed }
}

function assertProtectedBaksIntact(activePath, snapshots) {
  for (const [suffix, before] of Object.entries(snapshots)) {
    const p = activePath + suffix
    if (!fs.existsSync(p)) {
      if (before == null) continue
      console.error('PROTECTED_BAK_MISSING', p)
      process.exit(1)
    }
    const after = fs.statSync(p).size
    if (before != null && after !== before) {
      console.error('PROTECTED_BAK_CHANGED', { path: p, before, after })
      process.exit(1)
    }
  }
}

function verifyActive(store, activePath) {
  const clinicKeys = Object.keys(store.clinics || {})
  if (clinicKeys.length !== 1 || clinicKeys[0] !== CANONICAL) {
    console.error('ALIAS_REINTRODUCED', clinicKeys)
    process.exit(1)
  }
  const bytes = fs.statSync(activePath).size
  if (bytes > MAX_ACTIVE_BYTES) {
    console.error('ACTIVE_TOO_LARGE', bytes)
    process.exit(1)
  }
  const bucket = store.clinics[CANONICAL] || {}
  const patients = countPatients(bucket.patients)
  const odontograms = Object.keys(bucket.odontograms || {}).length
  const drafts = Object.keys(bucket.drafts || {}).length
  const ok =
    patients.activo === EXPECTED.activo &&
    patients.valorado === EXPECTED.valorado &&
    patients.terminado === EXPECTED.terminado &&
    odontograms === EXPECTED.odontograms &&
    drafts === EXPECTED.drafts
  return { ok, bytes, clinicKeys, patients, odontograms, drafts }
}

function main() {
  if (!fs.existsSync(activePath)) {
    console.error('ACTIVE_MISSING', activePath)
    process.exit(1)
  }

  const protectedSnapshots = {
    '.bak-20261112': fs.existsSync(activePath + '.bak-20261112')
      ? fs.statSync(activePath + '.bak-20261112').size
      : null,
    '.bak-20261113-pre-merge': fs.existsSync(activePath + '.bak-20261113-pre-merge')
      ? fs.statSync(activePath + '.bak-20261113-pre-merge').size
      : null,
    '.bak-20261113-dedup': fs.existsSync(activePath + '.bak-20261113-dedup')
      ? fs.statSync(activePath + '.bak-20261113-dedup').size
      : null,
  }

  const source = pickSourceBak(activePath)
  console.log(
    JSON.stringify(
      {
        phase: 'source',
        chosen: source.path,
        sourceCounts: source.counts,
        reports: source.reports,
      },
      null,
      2,
    ),
  )

  if (verifyOnly) {
    const store = JSON.parse(fs.readFileSync(activePath, 'utf8'))
    const result = verifyActive(store, activePath)
    console.log('VERIFY_REPORT_JSON_BEGIN')
    console.log(JSON.stringify(result, null, 2))
    console.log('VERIFY_REPORT_JSON_END')
    assertProtectedBaksIntact(activePath, protectedSnapshots)
    if (!result.ok) process.exit(1)
    console.log('VERIFY_OK')
    return
  }

  const store = JSON.parse(fs.readFileSync(activePath, 'utf8'))
  if (!store.clinics || typeof store.clinics !== 'object') store.clinics = {}

  // Garantizar un solo cubo canónico (eliminar cualquier alias residual).
  const canonicalBucket = store.clinics[CANONICAL] || {
    patients: {},
    odontograms: {},
    drafts: {},
    clinicalRecords: {},
    appointments: {},
    diagnosticAids: {},
    attachments: {},
    sync_queue: {},
  }
  for (const key of Object.keys(store.clinics)) {
    if (key !== CANONICAL) delete store.clinics[key]
  }
  store.clinics[CANONICAL] = canonicalBucket

  if (!canonicalBucket.patients || typeof canonicalBucket.patients !== 'object') {
    canonicalBucket.patients = {}
  }

  let updated = 0
  let matched = 0
  let missingInActive = 0
  for (const [syncId, bakRec] of Object.entries(source.patients)) {
    const activeRec = canonicalBucket.patients[syncId]
    if (!activeRec || typeof activeRec !== 'object') {
      missingInActive++
      continue
    }
    matched++
    const { payload, changed } = restorePayloadFlags(payloadOf(bakRec), payloadOf(activeRec))
    if (changed) {
      canonicalBucket.patients[syncId] = { ...activeRec, payload }
      updated++
    }
  }

  const tmp = activePath + `.tmp-flags-${Date.now()}`
  fs.writeFileSync(tmp, JSON.stringify(store))
  fs.renameSync(tmp, activePath)

  assertProtectedBaksIntact(activePath, protectedSnapshots)

  const result = verifyActive(store, activePath)
  const report = {
    phase: 'done',
    sourceBak: source.path,
    matched,
    updated,
    missingInActive,
    protectedSnapshots,
    ...result,
  }
  console.log('FLAGS_REPORT_JSON_BEGIN')
  console.log(JSON.stringify(report, null, 2))
  console.log('FLAGS_REPORT_JSON_END')

  if (!result.ok) {
    console.error('COUNTS_MISMATCH', {
      expected: EXPECTED,
      got: {
        ...result.patients,
        odontograms: result.odontograms,
        drafts: result.drafts,
      },
    })
    process.exit(1)
  }
  console.log('FLAGS_RESTORE_OK')
}

main()
