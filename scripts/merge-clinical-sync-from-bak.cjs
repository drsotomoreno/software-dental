#!/usr/bin/env node
/**
 * Fusión atómica única: restaura llaves/entidades perdidas desde
 * clinical-sync.json.bak-20261112 hacia clinical-sync.json.
 * NO modifica el .bak-20261112.
 *
 * Uso:
 *   node scripts/merge-clinical-sync-from-bak.cjs /path/to/clinical-sync.json
 */
const fs = require('node:fs')
const path = require('node:path')

const CLINIC = 'clinic:doctormauriciosoto@gmail.com'
const BAK_SUFFIX = '.bak-20261112'
const PRE_MERGE_SUFFIX = '.bak-20261113-pre-merge'
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
  console.error('Usage: node merge-clinical-sync-from-bak.cjs /path/to/clinical-sync.json')
  process.exit(2)
}

const bakPath = activePath + BAK_SUFFIX
const preMergePath = activePath + PRE_MERGE_SUFFIX

function stamp(record) {
  const deleted = Date.parse(record?.deletedAt || '') || 0
  const updated = Date.parse(record?.updatedAt || '') || 0
  const server = Date.parse(record?.serverUpdatedAt || '') || 0
  return Math.max(deleted, updated, server)
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

function classifyNaive(payload) {
  if (payload.valuationOnly === true) return 'valorado'
  if (payload.treatmentCompleted === true) return 'terminado'
  return 'activo'
}

function countPatients(map) {
  const ui = { activo: 0, valorado: 0, terminado: 0 }
  const naive = { activo: 0, valorado: 0, terminado: 0 }
  for (const rec of Object.values(map || {})) {
    const p = rec?.payload && typeof rec.payload === 'object' ? rec.payload : {}
    ui[classify(p)]++
    naive[classifyNaive(p)]++
  }
  return { ui, naive, n: Object.keys(map || {}).length }
}

function isEmptyish(value) {
  if (value == null) return true
  if (typeof value === 'string' && value.trim() === '') return true
  if (Array.isArray(value) && value.length === 0) return true
  if (typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0) return true
  return false
}

/** Restaura desde bak sin pisar valores activos sustanciales; no deja vacíos ganar. */
function mergePayloadRestoreFromBak(bakPayload, activePayload) {
  const bak = bakPayload && typeof bakPayload === 'object' ? bakPayload : {}
  const active = activePayload && typeof activePayload === 'object' ? activePayload : {}
  const out = { ...bak }
  for (const [key, value] of Object.entries(active)) {
    if (value === undefined) continue
    const bakVal = bak[key]
    if (!(key in bak)) {
      out[key] = value
      continue
    }
    if (isEmptyish(value) && !isEmptyish(bakVal)) continue
    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      bakVal &&
      typeof bakVal === 'object' &&
      !Array.isArray(bakVal)
    ) {
      out[key] = mergePayloadRestoreFromBak(bakVal, value)
      continue
    }
    out[key] = value
  }
  return out
}

function mergeEntityMaps(mergePayloadNonDestructive, mergeSyncedRecordNonDestructive, activeMap = {}, bakMap = {}, bakMtimeMs) {
  const out = { ...activeMap }
  let restoredRecords = 0
  let mergedPayloads = 0
  let keysRestored = 0

  for (const [syncId, bakRec] of Object.entries(bakMap || {})) {
    if (!bakRec || typeof bakRec !== 'object') continue
    const activeRec = out[syncId]
    if (!activeRec) {
      out[syncId] = bakRec
      restoredRecords++
      continue
    }

    const bakPayload = bakRec.payload && typeof bakRec.payload === 'object' ? bakRec.payload : {}
    const activePayload =
      activeRec.payload && typeof activeRec.payload === 'object' ? activeRec.payload : {}
    const activeNewer = stamp(activeRec) > bakMtimeMs

    // Bak rellena huecos y valores vacíos; active gana solo con contenido real.
    const mergedPayload = mergePayloadRestoreFromBak(bakPayload, activePayload)

    const beforeKeys = Object.keys(activePayload).length
    const afterKeys = Object.keys(mergedPayload).length
    if (afterKeys > beforeKeys) keysRestored += afterKeys - beforeKeys

    const preferActiveMeta = activeNewer || stamp(activeRec) >= stamp(bakRec)
    const mergedRec = mergeSyncedRecordNonDestructive(
      { ...bakRec, payload: bakPayload },
      { ...activeRec, payload: mergedPayload },
      { preferNextMeta: preferActiveMeta },
    )
    mergedRec.payload = mergedPayload
    if (preferActiveMeta) {
      mergedRec.updatedAt = activeRec.updatedAt || bakRec.updatedAt
      mergedRec.serverUpdatedAt = activeRec.serverUpdatedAt || bakRec.serverUpdatedAt
      mergedRec.deletedAt =
        activeRec.deletedAt !== undefined ? activeRec.deletedAt : bakRec.deletedAt
    } else {
      mergedRec.updatedAt = bakRec.updatedAt || activeRec.updatedAt
      mergedRec.serverUpdatedAt = bakRec.serverUpdatedAt || activeRec.serverUpdatedAt
    }
    out[syncId] = mergedRec
    mergedPayloads++
  }

  return { map: out, restoredRecords, mergedPayloads, keysRestored }
}

async function main() {
  const { mergePayloadNonDestructive, mergeSyncedRecordNonDestructive } = await import(
    '../shared/clinicalSyncMerge.js'
  )
  if (!fs.existsSync(activePath)) {
    console.error('ACTIVE_MISSING', activePath)
    process.exit(1)
  }
  if (!fs.existsSync(bakPath)) {
    console.error('BAK_MISSING', bakPath)
    process.exit(1)
  }

  const bakStat = fs.statSync(bakPath)
  const bakMtimeMs = bakStat.mtimeMs
  console.log(
    JSON.stringify({
      phase: 'start',
      activePath,
      bakPath,
      bakBytes: bakStat.size,
      bakMtime: bakStat.mtime.toISOString(),
    }),
  )

  // Copia de seguridad del estado actual (no toca bak-20261112).
  fs.copyFileSync(activePath, preMergePath)
  console.log(
    JSON.stringify({
      phase: 'pre_merge_backup',
      path: preMergePath,
      bytes: fs.statSync(preMergePath).size,
    }),
  )

  const active = JSON.parse(fs.readFileSync(activePath, 'utf8'))
  const bak = JSON.parse(fs.readFileSync(bakPath, 'utf8'))
  const activeClinic = (active.clinics && active.clinics[CLINIC]) || {}
  const bakClinic = (bak.clinics && bak.clinics[CLINIC]) || {}

  const before = {
    patients: countPatients(activeClinic.patients),
    odontograms: Object.keys(activeClinic.odontograms || {}).length,
    drafts: Object.keys(activeClinic.drafts || {}).length,
  }
  const bakCounts = {
    patients: countPatients(bakClinic.patients),
    odontograms: Object.keys(bakClinic.odontograms || {}).length,
    drafts: Object.keys(bakClinic.drafts || {}).length,
  }

  const stats = {}
  const mergedClinic = { ...activeClinic }
  for (const key of ENTITY_KEYS) {
    const result = mergeEntityMaps(
      mergePayloadNonDestructive,
      mergeSyncedRecordNonDestructive,
      activeClinic[key] || {},
      bakClinic[key] || {},
      bakMtimeMs,
    )
    mergedClinic[key] = result.map
    stats[key] = {
      restoredRecords: result.restoredRecords,
      mergedPayloads: result.mergedPayloads,
      keysRestored: result.keysRestored,
      finalCount: Object.keys(result.map).length,
      bakCount: Object.keys(bakClinic[key] || {}).length,
      activeBefore: Object.keys(activeClinic[key] || {}).length,
    }
  }

  if (!active.clinics) active.clinics = {}
  active.clinics[CLINIC] = mergedClinic

  const after = {
    patients: countPatients(mergedClinic.patients),
    odontograms: Object.keys(mergedClinic.odontograms || {}).length,
    drafts: Object.keys(mergedClinic.drafts || {}).length,
  }

  const tmpPath = activePath + `.tmp-merge-${Date.now()}`
  fs.writeFileSync(tmpPath, JSON.stringify(active), 'utf8')
  fs.renameSync(tmpPath, activePath)

  // Verificar que bak-20261112 sigue intacto.
  const bakAfter = fs.statSync(bakPath)
  if (bakAfter.size !== bakStat.size) {
    console.error('BAK_MUTATED', { before: bakStat.size, after: bakAfter.size })
    process.exit(1)
  }

  const report = {
    phase: 'done',
    bakIntactBytes: bakAfter.size,
    preMergeBytes: fs.statSync(preMergePath).size,
    activeBytes: fs.statSync(activePath).size,
    before,
    bakCounts,
    after,
    entityStats: stats,
    targets: {
      naive: { activo: 43, valorado: 39, terminado: 24, odontogramsMin: 82 },
      uiFilter: after.patients.ui,
    },
    patientsMatch:
      after.patients.naive.activo === 43 &&
      after.patients.naive.valorado === 39 &&
      after.patients.naive.terminado === 24,
    odontogramsOk: after.odontograms >= 82,
    naiveMatch:
      after.patients.naive.activo === 43 &&
      after.patients.naive.valorado === 39 &&
      after.patients.naive.terminado === 24 &&
      after.odontograms >= 82,
  }
  console.log('MERGE_REPORT_JSON_BEGIN')
  console.log(JSON.stringify(report, null, 2))
  console.log('MERGE_REPORT_JSON_END')
  if (!report.patientsMatch) {
    console.error('COUNT_MISMATCH_PATIENTS_VS_43_39_24')
    process.exit(1)
  }
  if (!report.odontogramsOk) {
    console.error('COUNT_MISMATCH_ODONTOGRAMS_LT_82', after.odontograms)
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('MERGE_FATAL', err && err.stack ? err.stack : err)
  process.exit(1)
})
