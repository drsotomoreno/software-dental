import { db } from '@/db/database'
import { notasConCuv } from '@/utils/ripsCuvNota'

/**
 * Deja el CUV en cada copia de la nota (historia y borradores).
 * La fila de exportación lee esa metadata para pasar de «Listo para exportar» a «Transmitido».
 */
export async function guardarCuvEnNotas(
  noteIds: string[],
  cuv: string,
  when = new Date().toISOString(),
): Promise<void> {
  const ids = new Set(noteIds.map((id) => id.trim()).filter(Boolean))
  const codigo = cuv.trim()
  if (ids.size === 0 || !codigo) return

  const records = await db.clinicalRecords.toArray()
  for (const record of records) {
    if (record.id == null) continue
    const evolutionNotes = notasConCuv(record.evolutionNotes, ids, codigo, when)
    if (evolutionNotes === record.evolutionNotes) continue
    await db.clinicalRecords.update(record.id, { evolutionNotes })
  }

  const drafts = await db.patientClinicalDrafts.toArray()
  for (const draft of drafts) {
    if (!draft.patientId) continue
    const evolutionNotes = notasConCuv(draft.evolutionNotes, ids, codigo, when)
    const clinicalNotes = notasConCuv(draft.clinicalDraft?.evolutionNotes, ids, codigo, when)
    const valuationNotes = notasConCuv(draft.valuationDraft?.evolutionNotes, ids, codigo, when)
    if (
      evolutionNotes === draft.evolutionNotes &&
      clinicalNotes === draft.clinicalDraft?.evolutionNotes &&
      valuationNotes === draft.valuationDraft?.evolutionNotes
    ) {
      continue
    }
    await db.patientClinicalDrafts.update(draft.patientId, {
      evolutionNotes,
      clinicalDraft: draft.clinicalDraft
        ? { ...draft.clinicalDraft, evolutionNotes: clinicalNotes }
        : draft.clinicalDraft,
      valuationDraft: draft.valuationDraft
        ? { ...draft.valuationDraft, evolutionNotes: valuationNotes }
        : draft.valuationDraft,
    })
  }
}
