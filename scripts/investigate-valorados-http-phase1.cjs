#!/usr/bin/env node
/**
 * Fase 1 READ/DIAG: probes en disco + Postgres + pullClinicSnapshot + HTTP GET /api/sync/pull.
 * No modifica clinical-sync.json ni .bak-*.
 *
 * Uso (EC2, cwd app con .env):
 *   node --max-old-space-size=635 scripts/investigate-valorados-http-phase1.cjs
 */
const fs = require('node:fs')
const path = require('node:path')
const { pathToFileURL } = require('node:url')

const CANONICAL = 'clinic:doctormauriciosoto@gmail.com'
const PROBES = [
  '017ed372-ad13-42cc-8bc4-eea603634278',
  '04c42991-f8b4-432b-813a-28c54db80a26',
]
const MASTER_EMAIL = 'doctormauriciosoto@gmail.com'

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

function payloadOf(rec) {
  return rec?.payload && typeof rec.payload === 'object' ? rec.payload : {}
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

function countPatients(list) {
  const out = {
    n: 0,
    activo: 0,
    valorado: 0,
    terminado: 0,
    valuationOnlyTrue: 0,
    valuationOnlyFalse: 0,
    valuationOnlyNull: 0,
    phaseValoracion: 0,
  }
  for (const rec of list || []) {
    if (!rec) continue
    out.n++
    const p = payloadOf(rec)
    const vo = p.valuationOnly
    if (vo === true || vo === 'true') out.valuationOnlyTrue++
    else if (vo === false || vo === 'false') out.valuationOnlyFalse++
    else out.valuationOnlyNull++
    if (p.phase === 'VALORACION_RAPIDA') out.phaseValoracion++
    out[classify(p)]++
  }
  return out
}

function summarizeProbe(rec) {
  if (!rec || typeof rec !== 'object') return { found: false }
  const payload = payloadOf(rec)
  const rootKeys = Object.keys(rec).sort()
  const payloadKeys = Object.keys(payload).sort()
  return {
    found: true,
    rootKeys,
    payloadKeys,
    rootHasValuationOnly: Object.prototype.hasOwnProperty.call(rec, 'valuationOnly'),
    payloadHasValuationOnly: Object.prototype.hasOwnProperty.call(payload, 'valuationOnly'),
    rootValuationOnly: rec.valuationOnly,
    payloadValuationOnly: payload.valuationOnly,
    rootPhase: rec.phase,
    payloadPhase: payload.phase,
    rootTreatmentCompleted: rec.treatmentCompleted,
    payloadTreatmentCompleted: payload.treatmentCompleted,
    syncId: rec.syncId,
    clinicId: rec.clinicId,
    updatedAt: rec.updatedAt,
    serverUpdatedAt: rec.serverUpdatedAt,
    payloadUpdatedAt: payload.updatedAt,
    payloadServerUpdatedAt: payload.serverUpdatedAt,
    classify: classify(payload),
  }
}

async function queryPostgresProbes() {
  const mirrorUrl = pathToFileURL(
    path.resolve(process.cwd(), 'server/services/clinicPatientMirror.js'),
  ).href
  const durableUrl = pathToFileURL(
    path.resolve(process.cwd(), 'server/services/durableStore.js'),
  ).href
  const { clinicaUuidFromCanonical } = await import(mirrorUrl)
  const { withPgClient } = await import(durableUrl)
  const clinicaId = clinicaUuidFromCanonical(CANONICAL)

  return withPgClient(async (client) => {
    const cols = await client.query(
      `SELECT column_name, data_type
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'pacientes'
       ORDER BY ordinal_position`,
    )
    const probes = {}
    for (const syncId of PROBES) {
      const { rows } = await client.query(
        `SELECT sync_id, clinica_id::text, tipo_documento, numero_documento, nombres, apellidos,
                updated_at, deleted_at, to_jsonb(pacientes) AS full_row
         FROM pacientes
         WHERE sync_id = $1::text
         ORDER BY updated_at DESC NULLS LAST
         LIMIT 5`,
        [syncId],
      )
      probes[syncId] = rows.map((r) => ({
        sync_id: r.sync_id,
        clinica_id: r.clinica_id,
        expectedClinicaId: clinicaId,
        clinicaMatch: String(r.clinica_id) === String(clinicaId),
        tipo_documento: r.tipo_documento,
        numero_documento: r.numero_documento,
        nombres: r.nombres,
        apellidos: r.apellidos,
        updated_at: r.updated_at,
        deleted_at: r.deleted_at,
        rowKeys: r.full_row && typeof r.full_row === 'object' ? Object.keys(r.full_row).sort() : [],
        hasValuationOnlyCol: r.full_row && 'valuation_only' in r.full_row,
        valuation_only: r.full_row?.valuation_only,
        phase: r.full_row?.phase,
        treatment_completed: r.full_row?.treatment_completed,
      }))
    }

    let appJsonMeta = null
    try {
      const { rows } = await client.query(
        `SELECT key, pg_column_size(value) AS bytes, updated_at,
                (value->'clinics' ? $1) AS has_canonical
         FROM app_json_store WHERE key = 'clinical-sync'`,
        [CANONICAL],
      )
      appJsonMeta = rows[0] || null
      if (appJsonMeta) {
        const sample = await client.query(
          `SELECT value->'clinics'->$1->'patients'->$2 AS p1,
                  value->'clinics'->$1->'patients'->$3 AS p2
           FROM app_json_store WHERE key = 'clinical-sync'`,
          [CANONICAL, PROBES[0], PROBES[1]],
        )
        appJsonMeta.probes = {
          [PROBES[0]]: summarizeProbe(sample.rows[0]?.p1),
          [PROBES[1]]: summarizeProbe(sample.rows[0]?.p2),
        }
        const counts = await client.query(
          `WITH pts AS (
             SELECT jsonb_each(COALESCE(value->'clinics'->$1->'patients', '{}'::jsonb)) AS e
             FROM app_json_store WHERE key = 'clinical-sync'
           )
           SELECT count(*)::int AS n,
             count(*) FILTER (WHERE (e.value->'payload'->>'valuationOnly') IN ('true','True'))::int AS vo_true,
             count(*) FILTER (WHERE (e.value->'payload'->>'valuationOnly') IN ('false','False'))::int AS vo_false,
             count(*) FILTER (WHERE e.value->'payload'->>'valuationOnly' IS NULL)::int AS vo_null
           FROM pts`,
          [CANONICAL],
        )
        appJsonMeta.canonicalPatientFlags = counts.rows[0] || null
      }
    } catch (error) {
      appJsonMeta = { error: error instanceof Error ? error.message : String(error) }
    }

    return { clinicaId, columns: cols.rows, probes, appJsonMeta }
  })
}

async function httpPullCount() {
  const authUrl = pathToFileURL(
    path.resolve(process.cwd(), 'server/services/subscriptionAuthStore.js'),
  ).href
  const { MASTER_PASSWORD } = await import(authUrl)

  const base =
    process.env.PUBLIC_BASE_URL ||
    process.env.APP_PUBLIC_URL ||
    'http://127.0.0.1:3000'

  const loginRes = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ email: MASTER_EMAIL, password: MASTER_PASSWORD }),
  })
  const loginJson = await loginRes.json().catch(() => ({}))
  const token =
    loginJson.token ||
    loginJson.accessToken ||
    loginJson.session?.token ||
    loginJson.data?.token ||
    null

  if (!loginRes.ok || !token) {
    return {
      ok: false,
      loginStatus: loginRes.status,
      loginKeys: Object.keys(loginJson || {}),
      error: loginJson.error || loginJson.message || 'login_failed',
    }
  }

  const pullRes = await fetch(`${base}/api/sync/pull?full=0`, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
    },
  })
  const pullJson = await pullRes.json().catch(() => ({}))
  const patients = Array.isArray(pullJson.patients) ? pullJson.patients : []
  const counts = countPatients(patients)
  const probeSummaries = {}
  for (const id of PROBES) {
    const rec = patients.find((p) => String(p?.syncId) === id)
    probeSummaries[id] = summarizeProbe(rec)
  }

  return {
    ok: pullRes.ok && (pullJson.success === true || pullJson.ok === true || patients.length > 0),
    pullStatus: pullRes.status,
    clinicId: pullJson.clinicId || null,
    canonical: pullJson.canonical || null,
    patientCountField: pullJson.patientCount ?? null,
    counts,
    probes: probeSummaries,
    base,
  }
}

async function main() {
  const syncPath = resolveSyncPath()
  const store = JSON.parse(fs.readFileSync(syncPath, 'utf8'))
  const clinicKeys = Object.keys(store.clinics || {})
  const patientsMap = store.clinics?.[CANONICAL]?.patients || {}

  const diskProbes = {}
  for (const id of PROBES) {
    diskProbes[id] = summarizeProbe(patientsMap[id])
  }

  console.log('PHASE1_DISK_JSON')
  console.log(
    JSON.stringify(
      {
        syncPath,
        syncBytes: fs.statSync(syncPath).size,
        clinicKeys,
        diskCounts: countPatients(Object.values(patientsMap)),
        probes: diskProbes,
      },
      null,
      2,
    ),
  )

  try {
    const pg = await queryPostgresProbes()
    console.log('PHASE1_POSTGRES_JSON')
    console.log(JSON.stringify(pg, null, 2))
  } catch (error) {
    console.log(
      'PHASE1_POSTGRES_ERROR',
      error instanceof Error ? error.message : String(error),
    )
  }

  try {
    const storeUrl = pathToFileURL(
      path.resolve(process.cwd(), 'server/services/clinicalSyncStore.js'),
    ).href
    const mod = await import(storeUrl)
    const snapshot = await mod.pullClinicSnapshot(CANONICAL, [], { includeBlobs: false })
    const pullProbes = {}
    for (const id of PROBES) {
      const rec = (snapshot.patients || []).find((p) => String(p?.syncId) === id)
      pullProbes[id] = summarizeProbe(rec)
    }
    console.log('PHASE1_PULL_MODULE_JSON')
    console.log(
      JSON.stringify(
        {
          counts: countPatients(snapshot.patients || []),
          probes: pullProbes,
        },
        null,
        2,
      ),
    )
  } catch (error) {
    console.log(
      'PHASE1_PULL_MODULE_ERROR',
      error instanceof Error ? error.message : String(error),
    )
  }

  try {
    const http = await httpPullCount()
    console.log('PHASE1_HTTP_PULL_JSON')
    console.log(JSON.stringify(http, null, 2))
  } catch (error) {
    console.log(
      'PHASE1_HTTP_PULL_ERROR',
      error instanceof Error ? error.message : String(error),
    )
  }

  console.log('PHASE1_DONE')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
