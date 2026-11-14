#!/usr/bin/env node
/**
 * 1) Cuenta valuationOnly en disco vs pullClinicSnapshot (misma ruta que GET /api/sync/pull).
 * 2) Restaura flags desde .bak-20261113-dedup (solo lectura del bak).
 * 3) Bump serverUpdatedAt/updatedAt = now ISO en los 106 pacientes del canónico.
 * 4) Dedup aliases → un solo cubo. NO modifica .bak-*.
 *
 * Uso (en EC2, cwd app):
 *   node scripts/fix-valorados-pull-and-timestamps.cjs
 *   node scripts/fix-valorados-pull-and-timestamps.cjs --diagnose-only
 */
const fs = require('node:fs')
const path = require('node:path')
const { pathToFileURL } = require('node:url')

const CANONICAL = 'clinic:doctormauriciosoto@gmail.com'
const diagnoseOnly = process.argv.includes('--diagnose-only')

function resolveSyncPath() {
  const candidates = [
    path.resolve(process.cwd(), 'server/data/clinical-sync.json'),
    '/home/ubuntu/software-dental/server/data/clinical-sync.json',
    '/var/www/mihistoriadental/server/data/clinical-sync.json',
  ]
  for (const p of candidates) {
    if (fs.existsSync(p)) return p
  }
  throw new Error('clinical-sync.json no encontrado')
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

function isValuated(p) {
  if (coerceBool(p.treatmentCompleted) === true) return false
  const raw = p.valuationOnly
  if (raw === true || raw === 'true') return true
  if (raw === false || raw === 'false') return false
  return p.phase === 'VALORACION_RAPIDA'
}

function classify(p) {
  if (coerceBool(p.treatmentCompleted) === true) return 'terminado'
  if (isValuated(p)) return 'valorado'
  return 'activo'
}

function payloadOf(rec) {
  return rec?.payload && typeof rec.payload === 'object' ? rec.payload : {}
}

function countPatients(mapOrList) {
  const list = Array.isArray(mapOrList)
    ? mapOrList
    : Object.values(mapOrList || {})
  const out = {
    n: 0,
    activo: 0,
    valorado: 0,
    terminado: 0,
    valuationOnlyTrue: 0,
    valuationOnlyFalse: 0,
    valuationOnlyNull: 0,
  }
  for (const rec of list) {
    if (!rec) continue
    out.n++
    const p = payloadOf(rec)
    const vo = p.valuationOnly
    if (vo === true || vo === 'true') out.valuationOnlyTrue++
    else if (vo === false || vo === 'false') out.valuationOnlyFalse++
    else out.valuationOnlyNull++
    out[classify(p)]++
  }
  return out
}

function stamp(rec) {
  return Math.max(
    Date.parse(rec?.deletedAt || '') || 0,
    Date.parse(rec?.updatedAt || '') || 0,
    Date.parse(rec?.serverUpdatedAt || '') || 0,
  )
}

function flagScore(rec) {
  const p = payloadOf(rec)
  let s = 0
  if ('valuationOnly' in p) s += 2
  if ('treatmentCompleted' in p) s += 2
  if (p.phase) s += 1
  if (p.valuationOnly === true || p.valuationOnly === 'true') s += 3
  if (coerceBool(p.treatmentCompleted) === true) s += 3
  if (p.phase === 'VALORACION_RAPIDA') s += 2
  return s
}

function collectPatientsFromBak(store) {
  const out = {}
  for (const bucket of Object.values(store.clinics || {})) {
    for (const [id, rec] of Object.entries(bucket?.patients || {})) {
      if (!rec || typeof rec !== 'object') continue
      const prev = out[id]
      if (!prev) {
        out[id] = rec
        continue
      }
      const sa = flagScore(prev)
      const sb = flagScore(rec)
      if (sb > sa || (sb === sa && stamp(rec) >= stamp(prev))) out[id] = rec
    }
  }
  return out
}

function restoreFlags(activePayload, bakPayload) {
  const a = { ...(activePayload || {}) }
  const b = bakPayload || {}
  let changed = false
  for (const key of ['valuationOnly', 'phase', 'treatmentCompleted']) {
    if (!(key in b)) continue
    if (a[key] !== b[key]) {
      a[key] = b[key]
      changed = true
    }
  }
  for (const [k, v] of Object.entries(b)) {
    if (['valuationOnly', 'phase', 'treatmentCompleted'].includes(k)) continue
    if (!(k in a) || a[k] == null || a[k] === '') {
      if (v != null && v !== '' && a[k] !== v) {
        a[k] = v
        changed = true
      }
    }
  }
  return { payload: a, changed }
}

async function countViaPullApi(canonical) {
  const storeUrl = pathToFileURL(
    path.resolve(process.cwd(), 'server/services/clinicalSyncStore.js'),
  ).href
  const mod = await import(storeUrl)
  const snapshot = await mod.pullClinicSnapshot(canonical, [], { includeBlobs: false })
  return countPatients(snapshot.patients || [])
}

async function remirrorPostgres(canonical, patientsMap) {
  try {
    const mirrorUrl = pathToFileURL(
      path.resolve(process.cwd(), 'server/services/clinicPatientMirror.js'),
    ).href
    const { mirrorClinicPatients } = await import(mirrorUrl)
    const result = await mirrorClinicPatients(canonical, Object.values(patientsMap || {}))
    return result
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

async function main() {
  const syncPath = resolveSyncPath()
  const bakDedup = syncPath + '.bak-20261113-dedup'
  const bak12 = syncPath + '.bak-20261112'
  console.log(
    JSON.stringify(
      {
        syncPath,
        syncBytes: fs.statSync(syncPath).size,
        cwd: process.cwd(),
        bakDedupExists: fs.existsSync(bakDedup),
        bak12Exists: fs.existsSync(bak12),
      },
      null,
      2,
    ),
  )

  const store = JSON.parse(fs.readFileSync(syncPath, 'utf8'))
  const beforeKeys = Object.keys(store.clinics || {})
  const diskBefore = countPatients(store.clinics?.[CANONICAL]?.patients)

  console.log('DISK_BEFORE_JSON')
  console.log(JSON.stringify({ clinicKeys: beforeKeys, ...diskBefore }, null, 2))

  let pullBefore = null
  try {
    pullBefore = await countViaPullApi(CANONICAL)
    console.log('PULL_API_BEFORE_JSON')
    console.log(JSON.stringify(pullBefore, null, 2))
  } catch (error) {
    console.log(
      'PULL_API_BEFORE_ERROR',
      error instanceof Error ? error.message : String(error),
    )
  }

  if (diagnoseOnly) {
    process.exit(0)
  }

  // Fuente de flags: dedup bak, si no 20261112
  const bakPath = fs.existsSync(bakDedup) ? bakDedup : bak12
  if (!fs.existsSync(bakPath)) {
    console.error('NO_BAK_FOR_FLAGS')
    process.exit(1)
  }
  const bakBytesBefore = fs.statSync(bakPath).size
  const bakStore = JSON.parse(fs.readFileSync(bakPath, 'utf8'))
  const bakPatients = collectPatientsFromBak(bakStore)
  console.log(
    JSON.stringify(
      {
        bakPath,
        bakBytes: bakBytesBefore,
        bakCounts: countPatients(bakPatients),
      },
      null,
      2,
    ),
  )

  // Fold aliases into canonical first
  let foldedPatients = { ...(store.clinics?.[CANONICAL]?.patients || {}) }
  for (const [key, bucket] of Object.entries(store.clinics || {})) {
    if (key === CANONICAL) continue
    for (const [id, rec] of Object.entries(bucket?.patients || {})) {
      const prev = foldedPatients[id]
      if (!prev || stamp(rec) >= stamp(prev)) foldedPatients[id] = rec
    }
  }

  const now = new Date().toISOString()
  let flagsUpdated = 0
  let timestampsBumped = 0
  for (const [syncId, bakRec] of Object.entries(bakPatients)) {
    const active = foldedPatients[syncId]
    if (!active) continue
    const { payload, changed } = restoreFlags(payloadOf(active), payloadOf(bakRec))
    const next = { ...active, payload: { ...payload } }
    if (changed) flagsUpdated++
    const prevUpdated = next.updatedAt || payload.updatedAt
    next.serverUpdatedAt = now
    next.updatedAt = now
    next.payload.serverUpdatedAt = now
    next.payload.updatedAt = now
    if (!prevUpdated || Date.parse(prevUpdated) < Date.parse(now) - 60_000) {
      timestampsBumped++
    }
    foldedPatients[syncId] = next
  }

  // Pacientes solo en activo (sin bak): igual bump timestamps
  for (const [syncId, active] of Object.entries(foldedPatients)) {
    if (bakPatients[syncId]) continue
    foldedPatients[syncId] = {
      ...active,
      serverUpdatedAt: now,
      updatedAt: now,
      payload: {
        ...payloadOf(active),
        serverUpdatedAt: now,
        updatedAt: now,
      },
    }
    timestampsBumped++
  }

  const empty = {
    patients: {},
    odontograms: {},
    drafts: {},
    clinicalRecords: {},
    appointments: {},
    diagnosticAids: {},
    attachments: {},
    sync_queue: {},
  }
  const canonicalBucket = { ...(store.clinics?.[CANONICAL] || empty) }
  // Merge entity maps from aliases (non-patient)
  for (const [key, bucket] of Object.entries(store.clinics || {})) {
    if (key === CANONICAL) continue
    for (const entity of [
      'odontograms',
      'drafts',
      'clinicalRecords',
      'appointments',
      'diagnosticAids',
      'attachments',
      'sync_queue',
    ]) {
      canonicalBucket[entity] = {
        ...(canonicalBucket[entity] || {}),
        ...(bucket?.[entity] || {}),
      }
    }
  }
  canonicalBucket.patients = foldedPatients
  store.clinics = { [CANONICAL]: canonicalBucket }

  const tmp = syncPath + `.tmp-valorados-${Date.now()}`
  fs.writeFileSync(tmp, JSON.stringify(store))
  fs.renameSync(tmp, syncPath)

  // Bak intactos
  if (fs.existsSync(bakPath) && fs.statSync(bakPath).size !== bakBytesBefore) {
    console.error('BAK_CHANGED')
    process.exit(1)
  }

  const diskAfter = countPatients(store.clinics[CANONICAL].patients)
  console.log('DISK_AFTER_JSON')
  console.log(
    JSON.stringify(
      {
        flagsUpdated,
        timestampsBumped,
        clinicKeys: Object.keys(store.clinics),
        bytes: fs.statSync(syncPath).size,
        ...diskAfter,
      },
      null,
      2,
    ),
  )

  const mirror = await remirrorPostgres(CANONICAL, foldedPatients)
  console.log('MIRROR_PG_JSON', JSON.stringify(mirror))

  let pullAfter = null
  try {
    // Invalidar caché del módulo si hay singleton — reimport fresco
    pullAfter = await countViaPullApi(CANONICAL)
    console.log('PULL_API_AFTER_JSON')
    console.log(JSON.stringify(pullAfter, null, 2))
  } catch (error) {
    console.log(
      'PULL_API_AFTER_ERROR',
      error instanceof Error ? error.message : String(error),
    )
  }

  console.log('SUMMARY_JSON')
  console.log(
    JSON.stringify(
      {
        pullBefore,
        pullAfter,
        diskAfter,
        valuationOnlyTrue_pull_before: pullBefore?.valuationOnlyTrue ?? null,
        valuationOnlyTrue_pull_after: pullAfter?.valuationOnlyTrue ?? null,
      },
      null,
      2,
    ),
  )

  if (diskAfter.valorado < 39 || (pullAfter && pullAfter.valorado < 39)) {
    console.error('VALORADOS_STILL_LOW')
    process.exit(1)
  }
  console.log('FIX_VALORADOS_OK')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
