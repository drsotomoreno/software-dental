import { db } from '@/db/database'
import type { EvolutionNote, Evolucion } from '@/types/evolutionNote'
import { toDexiePrimaryKey } from '@/utils'
import {
  firmarEvolucion,
  type FirmaEvolucion,
} from '@/services/clinicalHistorySignature'
import { guardarEvolucionFirmada } from '@/services/evolutionNoteService'

export async function listarHistoriasDelPaciente(patientId: string) {
  const stringKey = String(patientId)
  const numericKey = toDexiePrimaryKey(patientId)
  const byString = await db.clinicalRecords.where('patientId').equals(stringKey).toArray()
  let byNumeric: typeof byString = []
  if (typeof numericKey === 'number') {
    byNumeric = await db.clinicalRecords.where('patientId').equals(numericKey).toArray()
  }
  const merged = new Map([...byString, ...byNumeric].map((record) => [String(record.id), record]))
  return [...merged.values()]
}

/**
 * Firma una evolución y la guarda en su tabla.
 * No actualiza la historia de apertura ni sus campos de firma.
 */
export async function firmarEvolucionPersistida(input: {
  patientId: string
  notes: EvolutionNote[]
  evolucionId: string
  firma: FirmaEvolucion
  clinicalRecordId?: string
}): Promise<EvolutionNote[]> {
  const notes = await firmarEvolucion(input.notes, input.evolucionId, input.firma)
  const signed = notes.find((note) => note.id === input.evolucionId)
  if (!signed) {
    throw new Error('La evolución no existe.')
  }
  await guardarEvolucionFirmada(input.patientId, signed, input.clinicalRecordId)
  return notes
}

export async function listarEvolucionesDelPaciente(patientId: string): Promise<Evolucion[]> {
  return db.evolutions.where('patientId').equals(String(patientId)).toArray()
}
