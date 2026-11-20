/**
 * Ficha clínica en AWS RDS (patient_clinical_charts).
 * Escritura transaccional con control optimista:
 *   WHERE clinical_revision <= $incomingRevision
 * Si RDS no está, el espejo clinical-sync.json sigue siendo la copia de respaldo.
 */
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { withPgClient } from './durableStore.js'
import { splitSqlStatements } from './consultasRepository.js'
import { computeClinicalFormHash } from '../../shared/clinicalFormHash.js'
import { persistExtractedClinicalMedia, rehydrateClinicalMedia } from './clinicalMediaStore.js'

const DIR = dirname(fileURLToPath(import.meta.url))
const MIGRATION = join(DIR, '../db/migrations/20261119150000_patient_clinical_charts.sql')

let schemaReady = null

async function ensureSchema() {
  if (schemaReady) return schemaReady
  schemaReady = (async () => {
    const sql = await readFile(MIGRATION, 'utf8')
    await withPgClient(async (client) => {
      for (const statement of splitSqlStatements(sql)) {
        await client.query(statement)
      }
    })
  })().catch((error) => {
    schemaReady = null
    throw error
  })
  return schemaReady
}

function textList(values) {
  return [...new Set((values || []).map((value) => String(value || '').trim()).filter(Boolean))]
}

function chartPayload(chart) {
  const draft = chart?.draft
  const payload =
    draft?.payload && typeof draft.payload === 'object' && !Array.isArray(draft.payload)
      ? draft.payload
      : draft && typeof draft === 'object'
        ? draft
        : {}
  return payload
}

function chartMeta(chart) {
  const payload = chartPayload(chart)
  const form = payload.clinicalDraft || payload.valuationDraft || payload
  const revisionRaw = Number(payload.clinicalRevision || draftRevision(chart) || 1)
  const clinicalRevision =
    Number.isFinite(revisionRaw) && revisionRaw > 0 ? Math.trunc(revisionRaw) : 1
  let contentHash = String(payload.contentHash || '').trim()
  if (!contentHash) {
    try {
      contentHash = computeClinicalFormHash(form)
    } catch {
      contentHash = ''
    }
  }
  return { clinicalRevision, contentHash: contentHash || '0' }
}

function draftRevision(chart) {
  const draft = chart?.draft
  if (!draft || typeof draft !== 'object') return 0
  return Number(draft.clinicalRevision || draft.payload?.clinicalRevision || 0)
}

function chartIsEmpty(chart) {
  if (!chart || typeof chart !== 'object') return true
  if (chart.draft) return false
  if (Array.isArray(chart.clinicalRecords) && chart.clinicalRecords.length > 0) return false
  if (Array.isArray(chart.odontograms) && chart.odontograms.length > 0) return false
  return true
}

const UPSERT_SQL = `INSERT INTO patient_clinical_charts (
  clinica_id, patient_sync_id, document_number, clinical_revision,
  content_hash, chart_data, updated_by, updated_at
) VALUES (
  $1::text, $2::text, $3::text, $4::integer,
  $5::text, $6::jsonb, $7::text, NOW()
)
ON CONFLICT (clinica_id, patient_sync_id) DO UPDATE SET
  document_number = COALESCE(EXCLUDED.document_number, patient_clinical_charts.document_number),
  clinical_revision = EXCLUDED.clinical_revision,
  content_hash = EXCLUDED.content_hash,
  chart_data = EXCLUDED.chart_data,
  updated_by = EXCLUDED.updated_by,
  updated_at = NOW()
WHERE patient_clinical_charts.clinical_revision <= $4::integer
RETURNING patient_sync_id, clinical_revision`

/**
 * @returns {Promise<{ applied: boolean, clinicalRevision: number }>}
 */
export async function upsertPatientClinicalChart(input) {
  const clinicaId = String(input?.clinicaId || input?.clinica_id || '').trim()
  const patientSyncId = String(input?.patientSyncId || input?.patient_sync_id || '').trim()
  if (!clinicaId || !patientSyncId) {
    return { applied: false, clinicalRevision: 0, conflict: false }
  }
  const { clinicalRevision, contentHash } = chartMeta(input)
  const documentNumber = String(input?.documentNumber || input?.document_number || '').trim() || null
  const updatedBy = String(input?.updatedBy || input?.updated_by || '').trim() || null
  const stored = await persistExtractedClinicalMedia({
    patientSyncId,
    documentNumber,
    localId: input?.localId || null,
    draft: input?.draft || null,
    clinicalRecords: Array.isArray(input?.clinicalRecords) ? input.clinicalRecords : [],
    odontograms: Array.isArray(input?.odontograms) ? input.odontograms : [],
    diagnosticAids: Array.isArray(input?.diagnosticAids) ? input.diagnosticAids : [],
  })

  await ensureSchema()
  return withPgClient(async (client) => {
    await client.query('BEGIN')
    try {
      const before = await client.query(
        `SELECT clinical_revision, content_hash, chart_data
           FROM patient_clinical_charts
          WHERE clinica_id = $1::text AND patient_sync_id = $2::text
          LIMIT 1
          FOR UPDATE`,
        [clinicaId, patientSyncId],
      )
      const prevRow = before.rows[0] || null
      const prevRevision = Number(prevRow?.clinical_revision || 0)
      // Optimistic lock: no sobrescribir si el servidor ya tiene revisión mayor.
      if (prevRevision > clinicalRevision) {
        await client.query('ROLLBACK')
        return {
          applied: false,
          conflict: true,
          clinicalRevision: prevRevision,
          code: 'VERSION_CONFLICT',
        }
      }

      const result = await client.query(UPSERT_SQL, [
        clinicaId,
        patientSyncId,
        documentNumber,
        clinicalRevision,
        contentHash,
        JSON.stringify(stored.value),
        updatedBy,
      ])

      // Auditoría detallada (before/after plan/presupuesto) la escribe el cliente
      // en clinicalAuditLogs y se mirror a RDS vía /api/sync/push.
      void prevRow

      await client.query('COMMIT')
      return {
        applied: result.rowCount > 0,
        conflict: false,
        clinicalRevision: result.rows[0]?.clinical_revision ?? clinicalRevision,
      }
    } catch (error) {
      try {
        await client.query('ROLLBACK')
      } catch {
        /* el rollback no tapa el error original */
      }
      throw error
    }
  })
}

const READ_SQL = `SELECT clinica_id, patient_sync_id, document_number, clinical_revision,
        content_hash, chart_data, updated_by, updated_at
   FROM patient_clinical_charts
  WHERE clinica_id = ANY($1::text[])
    AND (
      patient_sync_id = ANY($2::text[])
      OR (
        document_number IS NOT NULL
        AND document_number <> ''
        AND document_number = ANY($2::text[])
      )
    )
  ORDER BY clinical_revision DESC
  LIMIT 1`

export async function readPatientClinicalChart(clinicaId, aliasIds, needles) {
  const clinics = textList([clinicaId, ...(Array.isArray(aliasIds) ? aliasIds : [])])
  const keys = textList(needles)
  if (clinics.length === 0 || keys.length === 0) return null
  await ensureSchema()
  return withPgClient(async (client) => {
    const { rows } = await client.query(READ_SQL, [clinics, keys])
    return rows[0] || null
  })
}

/**
 * RDS primero. Si no hay fila, migra desde clinical-sync.json y la inserta.
 */
export async function readOrMigratePatientChart(input) {
  const clinicaId = String(input?.clinicaId || '').trim()
  const aliasIds = Array.isArray(input?.aliasIds) ? input.aliasIds : []
  const needles = textList([
    input?.patientSyncId,
    input?.localId,
    input?.documentNumber,
    input?.routeId,
  ])
  let row = null
  try {
    row = await readPatientClinicalChart(clinicaId, aliasIds, needles)
  } catch (error) {
    console.warn(
      '[clinical-charts] Lectura RDS falló; se consulta clinical-sync.json:',
      error instanceof Error ? error.message : error,
    )
  }
  if (row?.chart_data) {
    const data = await rehydrateClinicalMedia(row.chart_data)
    return {
      source: 'postgres',
      clinicalRevision: row.clinical_revision,
      contentHash: row.content_hash,
      ...(data && typeof data === 'object' ? data : {}),
    }
  }

  const { pullPatientChart } = await import('./clinicalSyncStore.js')
  const chart = await pullPatientChart(
    clinicaId,
    String(input?.patientSyncId || input?.routeId || ''),
    aliasIds,
    {
      patientSyncId: input?.patientSyncId,
      localId: input?.localId,
      documentNumber: input?.documentNumber,
      routeId: input?.routeId,
    },
  )
  if (chartIsEmpty(chart)) return null
  try {
    await upsertPatientClinicalChart({
      clinicaId,
      patientSyncId: chart.patientSyncId || input?.patientSyncId || input?.routeId,
      documentNumber: chart.documentNumber || input?.documentNumber,
      localId: chart.localId || input?.localId,
      draft: chart.draft,
      clinicalRecords: chart.clinicalRecords,
      odontograms: chart.odontograms,
      diagnosticAids: chart.diagnosticAids,
      updatedBy: input?.updatedBy || 'migrate-clinical-sync',
    })
  } catch (error) {
    console.warn(
      '[clinical-charts] Migración a RDS omitida:',
      error instanceof Error ? error.message : error,
    )
  }
  const data = await rehydrateClinicalMedia(chart)
  return {
    source: 'clinical-sync',
    ...(data && typeof data === 'object' ? data : {}),
  }
}

/** Tras un push: una fila RDS por paciente tocado (draft o historia). */
export async function persistTouchedPatientCharts(clinicId, _clinic, body) {
  const incoming = body && typeof body === 'object' ? body : {}
  const rows = [
    ...(Array.isArray(incoming.drafts) ? incoming.drafts : []),
    ...(Array.isArray(incoming.clinicalRecords) ? incoming.clinicalRecords : []),
  ]
  if (rows.length === 0) return 0
  const seen = new Set()
  let written = 0
  const { pullPatientChart } = await import('./clinicalSyncStore.js')
  for (const raw of rows) {
    const payload = raw?.payload && typeof raw.payload === 'object' ? raw.payload : raw || {}
    const patientSyncId = String(
      payload.patientSyncId || raw?.patientSyncId || raw?.syncId || '',
    )
      .replace(/^draft:/, '')
      .trim()
    const localId = String(payload.patientId || payload.id || payload.localId || '').trim()
    const documentNumber = String(payload.documentNumber || '').trim()
    const key = patientSyncId || localId || documentNumber
    if (!key || seen.has(key)) continue
    seen.add(key)
    const chart = await pullPatientChart(clinicId, patientSyncId || localId, [], {
      patientSyncId,
      localId,
      documentNumber,
    })
    if (chartIsEmpty(chart)) continue
    const result = await upsertPatientClinicalChart({
      clinicaId: clinicId,
      patientSyncId: chart.patientSyncId || patientSyncId || localId,
      documentNumber: chart.documentNumber || documentNumber,
      localId: chart.localId || localId,
      draft: chart.draft,
      clinicalRecords: chart.clinicalRecords,
      odontograms: chart.odontograms,
      diagnosticAids: chart.diagnosticAids,
      updatedBy: String(incoming.updatedBy || incoming.userEmail || '').trim(),
      userEmail: String(incoming.userEmail || '').trim(),
    })
    if (result?.conflict) {
      // No incrementar written: el cliente debe resolver 409 vía EMR v2 / recarga.
      continue
    }
    if (result?.applied) written += 1
  }
  return written
}
