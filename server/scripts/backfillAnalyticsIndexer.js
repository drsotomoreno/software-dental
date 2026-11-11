#!/usr/bin/env node
/**
 * Fase 4.2 — Backfill del read model CQRS (idx_*).
 *
 * El indexador en vivo solo reacciona a pushes futuros. Este script lee el
 * snapshot histórico en app_json_store (key = clinical-sync) y proyecta cada
 * clínica hacia idx_pacientes / idx_evoluciones / idx_diagnosticos / idx_procedimientos.
 *
 * Nota de schema: app_json_store es (key, value jsonb, updated_at). El documento
 * clinical-sync anida clínicas en value.clinics[clinicId], no en columnas
 * clinic_id/document.
 *
 * Uso:
 *   node server/scripts/backfillAnalyticsIndexer.js
 *   node server/scripts/backfillAnalyticsIndexer.js --dry-run
 */
import '../config.js'
import { withPgClient } from '../services/durableStore.js'
import {
  ensureClinicalAnalyticsSchema,
  indexSnapshotDelta,
} from '../services/clinicalDataIndexer.service.js'

const STORE_KEY = 'clinical-sync'
const dryRun = process.argv.includes('--dry-run') || process.argv.includes('--dryrun')

function mapToArray(map) {
  if (!map || typeof map !== 'object' || Array.isArray(map)) return []
  return Object.values(map)
}

function clinicFingerprint(bucket) {
  const patients = Object.keys(bucket?.patients || {}).sort().join(',')
  const records = Object.keys(bucket?.clinicalRecords || {}).sort().join(',')
  return `${patients}#${records}`
}

function clinicPreferenceScore(clinicId) {
  const id = String(clinicId || '')
  let score = 0
  if (id.startsWith('clinic:')) score += 100
  if (id.includes('@')) score += 10
  if (/^[0-9a-f-]{36}$/i.test(id)) score -= 50
  score += Math.min(id.length, 40) / 1000
  return score
}

/**
 * Deduplica aliases replicados (mismo cubo bajo clinic:… y UUID legacy).
 * Prefiere la clave canónica clinic:….
 */
function selectCanonicalClinics(clinics) {
  const entries = Object.entries(clinics || {}).filter(
    ([, bucket]) => bucket && typeof bucket === 'object',
  )
  /** @type {Map<string, { clinicId: string, bucket: object }>} */
  const byFingerprint = new Map()

  for (const [clinicId, bucket] of entries) {
    const patients = Object.keys(bucket.patients || {}).length
    const records = Object.keys(bucket.clinicalRecords || {}).length
    if (patients === 0 && records === 0) continue

    const fingerprint = clinicFingerprint(bucket)
    const prev = byFingerprint.get(fingerprint)
    if (!prev || clinicPreferenceScore(clinicId) > clinicPreferenceScore(prev.clinicId)) {
      byFingerprint.set(fingerprint, { clinicId, bucket })
    }
  }

  return [...byFingerprint.values()].sort((a, b) =>
    a.clinicId.localeCompare(b.clinicId),
  )
}

async function loadClinicalSyncDocument() {
  return withPgClient(async (client) => {
    await client.query(`
      CREATE TABLE IF NOT EXISTS app_json_store (
        key text PRIMARY KEY,
        value jsonb NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `)
    const { rows } = await client.query(
      `SELECT key, value, updated_at
       FROM app_json_store
       WHERE key = $1::text`,
      [STORE_KEY],
    )
    return rows[0] || null
  })
}

async function truncateReadModel() {
  await withPgClient(async (client) => {
    await client.query(`
      TRUNCATE TABLE
        idx_diagnosticos,
        idx_procedimientos,
        idx_evoluciones,
        idx_pacientes
    `)
  })
}

async function main() {
  console.log('[backfill] Iniciando backfill del read model analytics (idx_*)…')
  if (dryRun) console.log('[backfill] Modo --dry-run: no se escribirá en idx_*.')

  await ensureClinicalAnalyticsSchema()
  console.log('[backfill] Schema idx_* + cleanup de tablas fantasma OK.')

  const row = await loadClinicalSyncDocument()
  if (!row?.value || typeof row.value !== 'object') {
    console.log('[backfill] No hay fila app_json_store.key=clinical-sync. Nada que indexar.')
    return { ok: true, clinics: 0, indexed: 0 }
  }

  const clinics = selectCanonicalClinics(row.value.clinics || {})
  const total = clinics.length
  console.log(
    `[backfill] Documento clinical-sync actualizado=${row.updated_at || 'n/d'}; clínicas con datos=${total}`,
  )

  if (total === 0) {
    return { ok: true, clinics: 0, indexed: 0 }
  }

  if (!dryRun) {
    console.log('[backfill] Truncando idx_* para reconstrucción limpia…')
    await truncateReadModel()
  }

  let indexedTotal = 0
  const details = []

  for (let i = 0; i < clinics.length; i += 1) {
    const { clinicId, bucket } = clinics[i]
    const n = i + 1
    const patientCount = Object.keys(bucket.patients || {}).length
    const recordCount = Object.keys(bucket.clinicalRecords || {}).length
    console.log(
      `[backfill] Procesando clínica ${n}/${total}: ${clinicId} (pacientes=${patientCount}, historias=${recordCount})…`,
    )

    const payload = {
      patients: mapToArray(bucket.patients),
      clinicalRecords: mapToArray(bucket.clinicalRecords),
    }

    if (dryRun) {
      details.push({ clinicId, patients: patientCount, clinicalRecords: recordCount, dryRun: true })
      continue
    }

    const result = await indexSnapshotDelta({ clinicId, payload })
    indexedTotal += Number(result?.indexed || 0)
    details.push({
      clinicId,
      indexed: result?.indexed || 0,
      patients: result?.patients || 0,
      evolutions: result?.evolutions || 0,
      diagnoses: result?.diagnoses || 0,
      procedures: result?.procedures || 0,
    })
    console.log(
      `[backfill]   → indexados=${result?.indexed || 0} (pac=${result?.patients || 0}, evo=${result?.evolutions || 0}, dx=${result?.diagnoses || 0}, proc=${result?.procedures || 0})`,
    )
  }

  const summary = {
    ok: true,
    dryRun,
    clinics: total,
    indexed: indexedTotal,
    details,
  }
  console.log('[backfill] Completado.')
  console.log(JSON.stringify(summary, null, 2))
  return summary
}

main()
  .then((summary) => {
    if (!summary?.ok) process.exitCode = 1
    process.exit(process.exitCode || 0)
  })
  .catch((error) => {
    console.error('[backfill] Falló:', error instanceof Error ? error.stack || error.message : error)
    process.exit(1)
  })
