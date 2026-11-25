import { withPgClient } from '../server/services/durableStore.js'

const DOC = '37861325'
const SYNC = '4a08b227-da3d-45f6-8325-a0ec906a45c9'

function len(value) {
  if (Array.isArray(value)) return value.length
  if (value && typeof value === 'object') return Object.keys(value).length
  return 0
}

function summarizeChart(chart) {
  if (!chart || typeof chart !== 'object') return null
  const forms = [chart, chart.clinicalDraft, chart.valuationDraft].filter(
    (form) => form && typeof form === 'object',
  )
  return forms.map((form) => ({
    diagnoses: len(form.diagnoses),
    chartEntries: len(form.diagnosticChart?.entries),
    plan: len(form.treatmentPlan),
    budget: len(form.budgetItems),
    notes: len(form.evolutionNotes),
    payments: len(form.paymentControl),
  }))
}

const report = await withPgClient(async (client) => {
  const charts = await client.query(
    `SELECT clinica_id, patient_sync_id, document_number, clinical_revision, updated_at, chart_data
       FROM patient_clinical_charts
      WHERE document_number = $1 OR patient_sync_id = $2
      ORDER BY updated_at DESC`,
    [DOC, SYNC],
  )
  const patients = await client.query(
    `SELECT id, clinica_id, legacy_sync_id, numero_documento, updated_at
       FROM emr_v2_patients
      WHERE numero_documento = $1 OR legacy_sync_id = $2`,
    [DOC, SYNC],
  )
  const ids = patients.rows.map((row) => row.id)
  let base = { rows: [] }
  let audit = { rows: [] }
  if (ids.length > 0) {
    base = await client.query(
      `SELECT patient_id, version, updated_at,
              jsonb_typeof(diagnosticos) AS dx_type,
              CASE WHEN jsonb_typeof(diagnosticos) = 'array' THEN jsonb_array_length(diagnosticos) ELSE NULL END AS dx_len,
              jsonb_typeof(plan_tratamiento) AS plan_type,
              octet_length(diagnosticos::text) AS dx_bytes,
              octet_length(plan_tratamiento::text) AS plan_bytes,
              octet_length(anamnesis::text) AS anam_bytes
         FROM emr_v2_clinical_base
        WHERE patient_id = ANY($1::uuid[])`,
      [ids],
    )
    audit = await client.query(
      `SELECT seq, action, created_at,
              octet_length(before_state::text) AS before_bytes,
              octet_length(after_state::text) AS after_bytes,
              before_state->>'version' AS before_version,
              after_state->>'version' AS after_version
         FROM emr_v2_forensic_audit_trail
        WHERE patient_id = ANY($1::uuid[])
        ORDER BY seq DESC
        LIMIT 40`,
      [ids],
    )
  }
  return {
    charts: charts.rows.map((row) => ({
      clinica_id: row.clinica_id,
      patient_sync_id: row.patient_sync_id,
      document_number: row.document_number,
      clinical_revision: row.clinical_revision,
      updated_at: row.updated_at,
      forms: summarizeChart(row.chart_data),
    })),
    patients: patients.rows,
    base: base.rows,
    audit: audit.rows,
  }
}, { bypassCooldown: true, markCooldownOnFailure: false })

console.log(JSON.stringify(report, null, 2))
process.exit(0)
