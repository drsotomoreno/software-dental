/**
 * Diagnóstico Nota #4 Isabel De la Rosa (CC 37861325) — RIPS / MUV.
 * Uso en EC2: node --max-old-space-size=3072 scripts/diag-isabel-note4.mjs
 */
import fs from 'fs'

const SYNC = '4a08b227-da3d-45f6-8325-a0ec906a45c9'
const DOC = '37861325'
const SYNC_PATH = process.argv[2] || 'server/data/clinical-sync.json'

function summarize(n, i) {
  const meta = n.ripsMetadata || {}
  return {
    index: i + 1,
    id: n.id,
    date: n.date,
    procedure: String(n.procedure || n.serviceName || '').slice(0, 80),
    cupsCode: n.cupsCode ?? null,
    catalogCups: (n.catalogServices || []).map((s) => s.cupsCode ?? null),
    catalogProcs: (n.catalogServices || []).map((s) =>
      String(s.procedure || s.serviceName || '').slice(0, 50),
    ),
    locked: Boolean(n.isLocked || (n.signedAt && n.contentHash)),
    signedAt: n.signedAt || null,
    cie10: meta.codDiagnosticoPrincipal || null,
    adminCups: meta.cupsCode ?? null,
    ripsEstado: meta.ripsEstado || null,
    tipo: meta.tipoVinculacionFinanciera || null,
    fev: meta.idFacturaElectronica || null,
    recibo: meta.idReciboAsociado || null,
    error: meta.ripsErrorLog || null,
    soporte: n.numeroSoportePago || null,
    cost: n.cost ?? n.valorProcedimiento ?? null,
  }
}

function notesFrom(form) {
  return Array.isArray(form?.evolutionNotes) ? form.evolutionNotes : []
}

if (!fs.existsSync(SYNC_PATH)) {
  console.log(JSON.stringify({ ok: false, error: 'sync_missing', SYNC_PATH }))
  process.exit(0)
}

const store = JSON.parse(fs.readFileSync(SYNC_PATH, 'utf8'))
const clinics = store.clinics || {}
let draft = null
let draftKey = null
let clinicId = null

for (const [cid, clinic] of Object.entries(clinics)) {
  for (const [key, rec] of Object.entries(clinic.drafts || {})) {
    const p = rec.payload || rec
    const hit =
      p.patientSyncId === SYNC ||
      p.patientId === SYNC ||
      key.includes(SYNC) ||
      JSON.stringify(p).includes(DOC)
    if (!hit) continue
    draft = p
    draftKey = key
    clinicId = cid
    break
  }
  if (draft) break
}

const forms = {
  root: notesFrom(draft),
  clinicalDraft: notesFrom(draft?.clinicalDraft),
  valuationDraft: notesFrom(draft?.valuationDraft),
}

const primary =
  forms.clinicalDraft.length >= forms.root.length ? forms.clinicalDraft : forms.root

console.log(
  JSON.stringify(
    {
      ok: Boolean(draft),
      clinicId,
      draftKey,
      noteCounts: {
        root: forms.root.length,
        clinicalDraft: forms.clinicalDraft.length,
        valuationDraft: forms.valuationDraft.length,
      },
      notes: primary.map(summarize),
      note4: primary[3] ? summarize(primary[3], 3) : null,
    },
    null,
    2,
  ),
)
