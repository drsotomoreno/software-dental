import { ensureEvolutionNoteIds, isRecoveredEvolutionNoteId } from '../shared/evolutionNoteIds.js'
import { withPgClient } from '../server/services/durableStore.js'

const DOC = '37861325'
const SYNC = '4a08b227-da3d-45f6-8325-a0ec906a45c9'

const row = await withPgClient(async (client) => {
  const { rows } = await client.query(
    `SELECT clinical_revision, updated_at, chart_data
       FROM patient_clinical_charts
      WHERE document_number = $1 OR patient_sync_id = $2
      ORDER BY updated_at DESC
      LIMIT 1`,
    [DOC, SYNC],
  )
  return rows[0] || null
})

if (!row) {
  console.log(JSON.stringify({ ok: false, error: 'chart_not_found' }))
  process.exit(0)
}

const chart = row.chart_data || {}
const candidates = [
  ['root', chart],
  ['clinicalDraft', chart.clinicalDraft],
  ['valuationDraft', chart.valuationDraft],
  ['draft.payload', chart.draft?.payload],
  ['draft.payload.clinicalDraft', chart.draft?.payload?.clinicalDraft],
  ['draft.payload.valuationDraft', chart.draft?.payload?.valuationDraft],
]

const forms = []
for (const [name, form] of candidates) {
  if (!form || typeof form !== 'object') continue
  const notes = Array.isArray(form.evolutionNotes) ? form.evolutionNotes : []
  if (notes.length === 0 && !['clinicalDraft', 'draft.payload.clinicalDraft', 'root'].includes(name)) {
    continue
  }
  const missing = notes.filter((n) => !String(n?.id ?? '').trim()).length
  const repaired = ensureEvolutionNoteIds(notes)
  forms.push({
    name,
    noteCount: notes.length,
    missingIds: missing,
    recoveredCount: repaired.filter((n) => isRecoveredEvolutionNoteId(n.id)).length,
    sample: repaired
      .filter((n) => isRecoveredEvolutionNoteId(n.id) || !String(n?.id ?? '').trim())
      .slice(0, 3)
      .map((n) => ({
        id: n.id,
        contentHash: n.contentHash ? String(n.contentHash).slice(0, 16) : null,
        clinicalNoteLen: String(n.clinicalNote || '').length,
        isLocked: Boolean(n.isLocked),
      })),
  })
}

console.log(
  JSON.stringify(
    {
      ok: true,
      clinical_revision: row.clinical_revision,
      updated_at: row.updated_at,
      forms,
    },
    null,
    2,
  ),
)
