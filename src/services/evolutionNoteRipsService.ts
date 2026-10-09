import { db } from '@/db/database'
import {
  createRipsConsultation as createRipsConsultationOn,
  createRipsProcedure as createRipsProcedureOn,
  deleteEvolutionNoteRecord as deleteEvolutionNoteRecordOn,
  getEvolutionNoteRecord as getEvolutionNoteRecordOn,
  listEvolutionNotesByPatient as listEvolutionNotesByPatientOn,
  listRipsByEvolutionNote as listRipsByEvolutionNoteOn,
  materializeRipsFromEvolutionNote as materializeRipsFromEvolutionNoteOn,
  saveEvolutionNoteRecord as saveEvolutionNoteRecordOn,
  type CreateRipsConsultationInput,
  type CreateRipsProcedureInput,
  type EvolutionNoteRipsDatabase,
} from '@/db/evolutionNoteRipsRepository'
import type { EvolutionNoteRecord } from '@/types/evolutionNoteRips'

export function getEvolutionNoteRipsDatabase(): EvolutionNoteRipsDatabase {
  return db as unknown as EvolutionNoteRipsDatabase
}

function ripsDatabase(): EvolutionNoteRipsDatabase {
  return getEvolutionNoteRipsDatabase()
}

/**
 * API de aplicación para la relación 1→N nota de evolución / RIPS.
 * Toda escritura de consultas o procedimientos incluye `evolution_notes`
 * en la transacción: el hook rechaza un RIPS cuya nota no exista.
 */
export function saveEvolutionNoteRecord(input: EvolutionNoteRecord) {
  return saveEvolutionNoteRecordOn(ripsDatabase(), input)
}

export function getEvolutionNoteRecord(evolutionNoteId: string) {
  return getEvolutionNoteRecordOn(ripsDatabase(), evolutionNoteId)
}

export function listEvolutionNotesByPatient(patientId: string) {
  return listEvolutionNotesByPatientOn(ripsDatabase(), patientId)
}

export function listRipsByEvolutionNote(evolutionNoteId: string) {
  return listRipsByEvolutionNoteOn(ripsDatabase(), evolutionNoteId)
}

export function createRipsConsultation(
  evolutionNoteId: string,
  input?: CreateRipsConsultationInput,
) {
  return createRipsConsultationOn(ripsDatabase(), evolutionNoteId, input)
}

export function createRipsProcedure(evolutionNoteId: string, input: CreateRipsProcedureInput) {
  return createRipsProcedureOn(ripsDatabase(), evolutionNoteId, input)
}

export function materializeRipsFromEvolutionNote(
  evolutionNoteId: string,
  values?: { vrConsulta?: number; vrProcedimiento?: number | number[] },
) {
  return materializeRipsFromEvolutionNoteOn(ripsDatabase(), evolutionNoteId, values)
}

export function deleteEvolutionNoteRecord(evolutionNoteId: string) {
  return deleteEvolutionNoteRecordOn(ripsDatabase(), evolutionNoteId)
}
