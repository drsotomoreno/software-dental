/**
 * Lectura del CUV ya sellado en Dexie (Exportación RIPS → nota abierta).
 * Permite que el panel de la evolución muestre verde sin recargar la página.
 */
import { db } from '@/db/database'
import type { EvolutionNoteRipsMetadata } from '@/types/evolutionNoteRips'

export type CuvDexieHit = {
  cuv: string
  ripsFechaTransmision: string | null
  ripsEstado: 'enviado_ok'
}

function hitDeNota(
  note: { id?: string | number | null; ripsMetadata?: Partial<EvolutionNoteRipsMetadata> | null } | null | undefined,
  noteId: string,
): CuvDexieHit | null {
  if (!note || String(note.id ?? '') !== noteId) return null
  const cuv = String(note.ripsMetadata?.cuv ?? '').trim()
  const estado = String(note.ripsMetadata?.ripsEstado ?? '').trim()
  if (!cuv || (estado !== 'enviado_ok' && estado !== 'radicado')) return null
  return {
    cuv,
    ripsFechaTransmision: note.ripsMetadata?.ripsFechaTransmision ?? null,
    ripsEstado: 'enviado_ok',
  }
}

export async function buscarCuvNotaEnDexie(noteId: string): Promise<CuvDexieHit | null> {
  const id = String(noteId ?? '').trim()
  if (!id) return null

  const records = await db.clinicalRecords.toArray()
  for (const record of records) {
    for (const note of record.evolutionNotes ?? []) {
      const hit = hitDeNota(note, id)
      if (hit) return hit
    }
  }

  const drafts = await db.patientClinicalDrafts.toArray()
  for (const draft of drafts) {
    const fuentes = [
      draft.evolutionNotes,
      draft.clinicalDraft?.evolutionNotes,
      draft.valuationDraft?.evolutionNotes,
    ]
    for (const notes of fuentes) {
      for (const note of notes ?? []) {
        const hit = hitDeNota(note, id)
        if (hit) return hit
      }
    }
  }

  return null
}
