import type Dexie from 'dexie'
import type { Table } from 'dexie'
import { generateId } from '@/utils/crypto'
import type {
  EvolutionNoteCupsProcedure,
  EvolutionNoteRecord,
  EvolutionNoteRipsBundle,
  RipsConsultationRecord,
  RipsProcedureRecord,
} from '@/types/evolutionNoteRips'
import {
  EVOLUTION_NOTE_CONSULTATION_NOT_DECLARED_MESSAGE,
  EVOLUTION_NOTE_PROCEDURE_NOT_DECLARED_MESSAGE,
  EVOLUTION_NOTE_SINGLE_CONSULTATION_MESSAGE,
  EvolutionNoteRipsError,
  RIPS_WITHOUT_EVOLUTION_NOTE_MESSAGE,
  assertServiceValue,
  normalizeCupsCode,
  normalizeEvolutionNoteRecord,
  requireEvolutionNoteId,
} from '@/types/evolutionNoteRips'

export interface EvolutionNoteRipsDatabase {
  evolution_notes: Table<EvolutionNoteRecord, string>
  rips_consultations: Table<RipsConsultationRecord, string>
  rips_procedures: Table<RipsProcedureRecord, string>
  transaction: Dexie['transaction']
}

export interface CreateRipsConsultationInput {
  id?: string
  vr_servicio?: number
  consecutivo?: number
}

export interface CreateRipsProcedureInput {
  id?: string
  /** Debe existir en `procedures_cups` de la nota. Si hay varios iguales, se usa el primero que aún no se haya emitido en esta llamada. */
  cups_code: string
  tooth_number?: number | null
  vr_servicio?: number
  consecutivo?: number
}

function nowIso(): string {
  return new Date().toISOString()
}

function isConstraintError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    (error as { name?: string }).name === 'ConstraintError'
  )
}

async function readEvolutionNote(
  database: EvolutionNoteRipsDatabase,
  evolutionNoteId: string,
): Promise<EvolutionNoteRecord> {
  const noteId = requireEvolutionNoteId(evolutionNoteId)
  const note = await database.evolution_notes.get(noteId)
  if (!note) {
    throw new EvolutionNoteRipsError(RIPS_WITHOUT_EVOLUTION_NOTE_MESSAGE)
  }
  return note
}

function findDeclaredProcedure(
  note: EvolutionNoteRecord,
  cupsCode: string,
  toothNumber?: number | null,
): EvolutionNoteCupsProcedure {
  const cups = normalizeCupsCode(cupsCode)
  const matches = note.procedures_cups.filter((item) => item.cups_code === cups)
  if (matches.length === 0) {
    throw new EvolutionNoteRipsError(EVOLUTION_NOTE_PROCEDURE_NOT_DECLARED_MESSAGE)
  }
  if (toothNumber == null) return matches[0]
  const byTooth = matches.find((item) => item.tooth_number === toothNumber)
  if (!byTooth) {
    throw new EvolutionNoteRipsError(EVOLUTION_NOTE_PROCEDURE_NOT_DECLARED_MESSAGE)
  }
  return byTooth
}

export function buildRipsConsultationFromNote(
  note: EvolutionNoteRecord,
  input: CreateRipsConsultationInput = {},
): RipsConsultationRecord {
  if (!note.consultation_cups) {
    throw new EvolutionNoteRipsError(EVOLUTION_NOTE_CONSULTATION_NOT_DECLARED_MESSAGE)
  }
  const now = nowIso()
  return {
    id: input.id?.trim() || generateId(),
    evolution_note_id: note.id,
    patient_id: note.patient_id,
    fecha_inicio_atencion: note.date_time,
    finalidad_tecnologia_salud: note.purpose_of_care,
    cod_diagnostico_principal: note.main_diagnosis_cie10,
    cod_diagnostico_relacionado_1: note.related_diagnoses_cie10[0] ?? null,
    cod_diagnostico_relacionado_2: note.related_diagnoses_cie10[1] ?? null,
    cod_diagnostico_relacionado_3: note.related_diagnoses_cie10[2] ?? null,
    cod_consulta: note.consultation_cups,
    vr_servicio: assertServiceValue(input.vr_servicio),
    consecutivo: input.consecutivo ?? 1,
    created_at: now,
    updated_at: now,
  }
}

export function buildRipsProcedureFromNote(
  note: EvolutionNoteRecord,
  procedure: EvolutionNoteCupsProcedure,
  input: { id?: string; vr_servicio?: number; consecutivo: number },
): RipsProcedureRecord {
  const now = nowIso()
  return {
    id: input.id?.trim() || generateId(),
    evolution_note_id: note.id,
    patient_id: note.patient_id,
    fecha_inicio_atencion: note.date_time,
    finalidad_tecnologia_salud: note.purpose_of_care,
    cod_diagnostico_principal: note.main_diagnosis_cie10,
    cod_diagnostico_relacionado: note.related_diagnoses_cie10[0] ?? null,
    cod_procedimiento: procedure.cups_code,
    pieza_dental: procedure.tooth_number ?? null,
    cuadrante_fdi: procedure.fdi_quadrant ?? null,
    arcada: procedure.arch ?? null,
    vr_servicio: assertServiceValue(input.vr_servicio),
    consecutivo: input.consecutivo,
    created_at: now,
    updated_at: now,
  }
}

export async function saveEvolutionNoteRecord(
  database: EvolutionNoteRipsDatabase,
  input: EvolutionNoteRecord,
): Promise<EvolutionNoteRecord> {
  const note = normalizeEvolutionNoteRecord({
    ...input,
    updated_at: new Date().toISOString(),
  })
  await database.evolution_notes.put(note)
  return (await database.evolution_notes.get(note.id)) ?? note
}

export async function getEvolutionNoteRecord(
  database: EvolutionNoteRipsDatabase,
  evolutionNoteId: string,
): Promise<EvolutionNoteRecord | undefined> {
  const noteId = requireEvolutionNoteId(evolutionNoteId)
  return database.evolution_notes.get(noteId)
}

export async function listEvolutionNotesByPatient(
  database: EvolutionNoteRipsDatabase,
  patientId: string,
): Promise<EvolutionNoteRecord[]> {
  if (typeof patientId !== 'string' || patientId.trim() === '') {
    throw new EvolutionNoteRipsError('patient_id es obligatorio.')
  }
  return database.evolution_notes.where('patient_id').equals(patientId.trim()).sortBy('date_time')
}

/** Consulta indexada: una consulta y N procedimientos de la misma nota. */
export async function listRipsByEvolutionNote(
  database: EvolutionNoteRipsDatabase,
  evolutionNoteId: string,
): Promise<EvolutionNoteRipsBundle> {
  const noteId = requireEvolutionNoteId(evolutionNoteId)
  const [consultation, procedures] = await Promise.all([
    database.rips_consultations.where('evolution_note_id').equals(noteId).first(),
    database.rips_procedures.where('evolution_note_id').equals(noteId).toArray(),
  ])
  procedures.sort((left, right) => left.consecutivo - right.consecutivo)
  return { consultation, procedures }
}

export async function createRipsConsultation(
  database: EvolutionNoteRipsDatabase,
  evolutionNoteId: string,
  input: CreateRipsConsultationInput = {},
): Promise<RipsConsultationRecord> {
  const noteId = requireEvolutionNoteId(evolutionNoteId)
  try {
    return await database.transaction(
      'rw',
      database.evolution_notes,
      database.rips_consultations,
      database.rips_procedures,
      async () => {
        const note = await readEvolutionNote(database, noteId)
        const existing = await database.rips_consultations
          .where('evolution_note_id')
          .equals(note.id)
          .count()
        if (existing > 0) {
          throw new EvolutionNoteRipsError(EVOLUTION_NOTE_SINGLE_CONSULTATION_MESSAGE)
        }
        const row = buildRipsConsultationFromNote(note, input)
        await database.rips_consultations.add(row)
        return (await database.rips_consultations.get(row.id)) ?? row
      },
    )
  } catch (error) {
    if (isConstraintError(error)) {
      throw new EvolutionNoteRipsError(EVOLUTION_NOTE_SINGLE_CONSULTATION_MESSAGE)
    }
    throw error
  }
}

export async function createRipsProcedure(
  database: EvolutionNoteRipsDatabase,
  evolutionNoteId: string,
  input: CreateRipsProcedureInput,
): Promise<RipsProcedureRecord> {
  const noteId = requireEvolutionNoteId(evolutionNoteId)
  return database.transaction(
    'rw',
    database.evolution_notes,
    database.rips_consultations,
    database.rips_procedures,
    async () => {
      const note = await readEvolutionNote(database, noteId)
      const declared = findDeclaredProcedure(note, input.cups_code, input.tooth_number)
      const current = await database.rips_procedures.where('evolution_note_id').equals(note.id).count()
      const row = buildRipsProcedureFromNote(note, declared, {
        id: input.id,
        vr_servicio: input.vr_servicio,
        consecutivo: input.consecutivo ?? current + 1,
      })
      await database.rips_procedures.add(row)
      return (await database.rips_procedures.get(row.id)) ?? row
    },
  )
}

/**
 * Regenera los RIPS de una nota a partir de sus campos clínicos.
 * Borra los derivados anteriores de esa nota y escribe 0..1 consulta y 0..N procedimientos.
 */
export async function materializeRipsFromEvolutionNote(
  database: EvolutionNoteRipsDatabase,
  evolutionNoteId: string,
  values?: { vrConsulta?: number; vrProcedimiento?: number | number[] },
): Promise<EvolutionNoteRipsBundle> {
  const noteId = requireEvolutionNoteId(evolutionNoteId)
  return database.transaction(
    'rw',
    database.evolution_notes,
    database.rips_consultations,
    database.rips_procedures,
    async () => {
      const note = await readEvolutionNote(database, noteId)
      await database.rips_consultations.where('evolution_note_id').equals(note.id).delete()
      await database.rips_procedures.where('evolution_note_id').equals(note.id).delete()

      if (note.consultation_cups) {
        const consultation = buildRipsConsultationFromNote(note, {
          vr_servicio: values?.vrConsulta,
          consecutivo: 1,
        })
        await database.rips_consultations.add(consultation)
      }

      for (let index = 0; index < note.procedures_cups.length; index += 1) {
        const procedure = note.procedures_cups[index]
        const listed = values?.vrProcedimiento
        const vr = Array.isArray(listed) ? listed[index] : listed
        const row = buildRipsProcedureFromNote(note, procedure, {
          vr_servicio: vr,
          consecutivo: index + 1,
        })
        await database.rips_procedures.add(row)
      }

      return listRipsByEvolutionNote(database, note.id)
    },
  )
}

export async function deleteEvolutionNoteRecord(
  database: EvolutionNoteRipsDatabase,
  evolutionNoteId: string,
): Promise<void> {
  const noteId = requireEvolutionNoteId(evolutionNoteId)
  await database.transaction(
    'rw',
    database.evolution_notes,
    database.rips_consultations,
    database.rips_procedures,
    async () => {
      const note = await database.evolution_notes.get(noteId)
      if (!note) return
      await database.evolution_notes.delete(noteId)
    },
  )
}
