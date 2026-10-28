import { applyEvolutionNoteRipsMetadata } from '../types/evolutionNoteRips.ts'

type Nota = {
  id?: string | number | null
  ripsMetadata?: object | null
  cost?: number | null
  isBillable?: boolean
  estadoRips?: string | null
}

function conCuv(note: Nota, cuv: string, when: string): Nota {
  return applyEvolutionNoteRipsMetadata(note, {
    ripsEstado: 'enviado_ok',
    cuv,
    ripsFechaTransmision: when,
    ripsErrorLog: null,
  })
}

/** Devuelve el mismo arreglo si ninguna nota coincide, para no reescribir la historia. */
export function notasConCuv(notes: Nota[] | null | undefined, noteIds: Set<string>, cuv: string, when: string): Nota[] | null | undefined {
  if (!notes?.length || noteIds.size === 0) return notes
  let changed = false
  const next = notes.map((note) => {
    if (!note?.id || !noteIds.has(String(note.id))) return note
    try {
      const updated = conCuv(note, cuv, when)
      changed = true
      return updated
    } catch {
      return note
    }
  })
  return changed ? next : notes
}

export function idsNotaDeFuentes(
  sources: Array<{
    record: {
      ripsAtencionNotaId?: string | number | null
      evolutionNotes?: Array<{ id?: string | number | null }> | null
    }
  }>,
): string[] {
  const ids: string[] = []
  for (const { record } of sources) {
    const marcada = (record as { ripsAtencionNotaId?: string | number | null }).ripsAtencionNotaId
    if (marcada != null && String(marcada)) {
      ids.push(String(marcada))
      continue
    }
    for (const note of record.evolutionNotes ?? []) {
      if (note?.id != null) ids.push(String(note.id))
    }
  }
  return ids
}

