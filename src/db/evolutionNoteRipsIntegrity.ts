import type {
  DBCore,
  DBCoreKeyRange,
  DBCoreMutateRequest,
  DBCoreMutateResponse,
  DBCoreTable,
  DBCoreTransaction,
  Dexie,
} from 'dexie'
import type {
  EvolutionNoteRecord,
  RipsConsultationRecord,
  RipsProcedureRecord,
} from '@/types/evolutionNoteRips'
import {
  EVOLUTION_NOTE_CONSULTATION_NOT_DECLARED_MESSAGE,
  EVOLUTION_NOTE_PROCEDURE_NOT_DECLARED_MESSAGE,
  EVOLUTION_NOTE_RIPS_DELETE_BLOCKED_MESSAGE,
  EVOLUTION_NOTE_RIPS_DELETE_TRANSACTION_MESSAGE,
  EvolutionNoteRipsError,
  RIPS_EVOLUTION_NOTE_TRANSACTION_MESSAGE,
  RIPS_WITHOUT_EVOLUTION_NOTE_MESSAGE,
  normalizeCupsCode,
  normalizeEvolutionNoteRecord,
  requireEvolutionNoteId,
} from '@/types/evolutionNoteRips'

/**
 * Esquema Dexie v29.
 * `rips_consultations.&evolution_note_id` es único: una nota, una consulta.
 * `rips_procedures.evolution_note_id` no es único: una nota, N procedimientos.
 */
export const EVOLUTION_NOTE_RIPS_SCHEMA = {
  evolution_notes:
    'id, patient_id, clinical_record_id, clinical_evolution_note_id, date_time, purpose_of_care, [patient_id+date_time]',
  rips_consultations: 'id, &evolution_note_id, patient_id, fecha_inicio_atencion',
  rips_procedures:
    'id, evolution_note_id, patient_id, cod_procedimiento, fecha_inicio_atencion',
} as const

type RipsChildKind = 'consultation' | 'procedure'

const GUARDED_TABLES = new Set(['evolution_notes', 'rips_consultations', 'rips_procedures'])

function relatedAt(note: EvolutionNoteRecord, index: number): string | null {
  return note.related_diagnoses_cie10[index] ?? null
}

function stampRipsChildFromNote(
  kind: RipsChildKind,
  note: EvolutionNoteRecord,
  obj: RipsConsultationRecord | RipsProcedureRecord,
): void {
  obj.evolution_note_id = note.id
  obj.patient_id = note.patient_id
  obj.fecha_inicio_atencion = note.date_time
  obj.finalidad_tecnologia_salud = note.purpose_of_care
  obj.cod_diagnostico_principal = note.main_diagnosis_cie10

  if (kind === 'consultation') {
    const row = obj as RipsConsultationRecord
    if (!note.consultation_cups) {
      throw new EvolutionNoteRipsError(EVOLUTION_NOTE_CONSULTATION_NOT_DECLARED_MESSAGE)
    }
    row.cod_consulta = note.consultation_cups
    row.cod_diagnostico_relacionado_1 = relatedAt(note, 0)
    row.cod_diagnostico_relacionado_2 = relatedAt(note, 1)
    row.cod_diagnostico_relacionado_3 = relatedAt(note, 2)
    return
  }

  const row = obj as RipsProcedureRecord
  const cups = normalizeCupsCode(row.cod_procedimiento ?? '')
  const matches = note.procedures_cups.filter((item) => item.cups_code === cups)
  if (matches.length === 0) {
    throw new EvolutionNoteRipsError(EVOLUTION_NOTE_PROCEDURE_NOT_DECLARED_MESSAGE)
  }
  row.cod_procedimiento = cups
  row.cod_diagnostico_relacionado = relatedAt(note, 0)

  const located =
    row.pieza_dental == null
      ? matches.length === 1
        ? matches[0]
        : undefined
      : matches.find((item) => item.tooth_number === row.pieza_dental)
  if (row.pieza_dental != null && !located) {
    throw new EvolutionNoteRipsError(EVOLUTION_NOTE_PROCEDURE_NOT_DECLARED_MESSAGE)
  }
  if (located) {
    row.pieza_dental = located.tooth_number ?? null
    row.cuadrante_fdi = located.fdi_quadrant ?? null
    row.arcada = located.arch ?? null
  }
}

async function readEvolutionNote(
  downlevel: DBCore,
  trans: DBCoreTransaction,
  evolutionNoteId: string,
): Promise<EvolutionNoteRecord> {
  try {
    const note = (await downlevel.table('evolution_notes').get({
      trans,
      key: evolutionNoteId,
    })) as EvolutionNoteRecord | undefined
    if (!note) {
      throw new EvolutionNoteRipsError(RIPS_WITHOUT_EVOLUTION_NOTE_MESSAGE)
    }
    return note
  } catch (error) {
    if (error instanceof EvolutionNoteRipsError) throw error
    throw new EvolutionNoteRipsError(RIPS_EVOLUTION_NOTE_TRANSACTION_MESSAGE)
  }
}

function evolutionNoteIndex(table: DBCoreTable) {
  const index = table.schema.getIndexByKeyPath('evolution_note_id')
  if (!index) {
    throw new EvolutionNoteRipsError(EVOLUTION_NOTE_RIPS_DELETE_TRANSACTION_MESSAGE)
  }
  return index
}

async function countRipsForNote(
  downlevel: DBCore,
  trans: DBCoreTransaction,
  evolutionNoteId: string,
): Promise<number> {
  try {
    const range: DBCoreKeyRange = {
      type: 1,
      lower: evolutionNoteId,
      upper: evolutionNoteId,
    }
    const [consultations, procedures] = await Promise.all([
      downlevel.table('rips_consultations').count({
        trans,
        query: { index: evolutionNoteIndex(downlevel.table('rips_consultations')), range },
      }),
      downlevel.table('rips_procedures').count({
        trans,
        query: { index: evolutionNoteIndex(downlevel.table('rips_procedures')), range },
      }),
    ])
    return consultations + procedures
  } catch (error) {
    if (error instanceof EvolutionNoteRipsError) throw error
    throw new EvolutionNoteRipsError(EVOLUTION_NOTE_RIPS_DELETE_TRANSACTION_MESSAGE)
  }
}

async function guardEvolutionNoteWrite(
  req: DBCoreMutateRequest,
  table: DBCoreTable,
  downlevel: DBCore,
  isRestoreUnlocked: () => boolean,
): Promise<DBCoreMutateResponse> {
  if (req.type === 'add' || req.type === 'put') {
    for (const value of req.values) {
      Object.assign(value, normalizeEvolutionNoteRecord(value as EvolutionNoteRecord))
    }
    return table.mutate(req)
  }

  if (isRestoreUnlocked()) return table.mutate(req)

  if (req.type === 'delete') {
    for (const key of req.keys) {
      const dependents = await countRipsForNote(downlevel, req.trans, String(key))
      if (dependents > 0) {
        throw new EvolutionNoteRipsError(EVOLUTION_NOTE_RIPS_DELETE_BLOCKED_MESSAGE)
      }
    }
    return table.mutate(req)
  }

  throw new EvolutionNoteRipsError(EVOLUTION_NOTE_RIPS_DELETE_TRANSACTION_MESSAGE)
}

async function guardRipsWrite(
  kind: RipsChildKind,
  req: DBCoreMutateRequest,
  table: DBCoreTable,
  downlevel: DBCore,
  isRestoreUnlocked: () => boolean,
): Promise<DBCoreMutateResponse> {
  if (req.type !== 'add' && req.type !== 'put') return table.mutate(req)

  for (const value of req.values) {
    const row = value as RipsConsultationRecord | RipsProcedureRecord
    const evolutionNoteId = requireEvolutionNoteId(row.evolution_note_id)
    row.evolution_note_id = evolutionNoteId
    if (isRestoreUnlocked()) continue
    const note = await readEvolutionNote(downlevel, req.trans, evolutionNoteId)
    stampRipsChildFromNote(kind, note, row)
  }

  return table.mutate(req)
}

/**
 * Impide persistir un RIPS sin nota y normaliza la nota antes de escribirla.
 * Dexie no espera promesas en los hooks `creating`, por eso la regla vive en dbcore.
 */
export function registerEvolutionNoteRipsGuards(
  database: Dexie,
  options: { isRestoreUnlocked: () => boolean },
): void {
  database.use({
    stack: 'dbcore',
    name: 'evolutionNoteRipsFk',
    create(downlevel) {
      return {
        ...downlevel,
        table(tableName) {
          const table = downlevel.table(tableName)
          if (!GUARDED_TABLES.has(tableName)) return table
          return {
            ...table,
            mutate(req) {
              if (tableName === 'evolution_notes') {
                return guardEvolutionNoteWrite(req, table, downlevel, options.isRestoreUnlocked)
              }
              const kind: RipsChildKind =
                tableName === 'rips_consultations' ? 'consultation' : 'procedure'
              return guardRipsWrite(kind, req, table, downlevel, options.isRestoreUnlocked)
            },
          }
        },
      }
    },
  })
}
