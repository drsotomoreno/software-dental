/**
 * Verifica la relación 1→N nota de evolución / RIPS contra IndexedDB.
 * Ejecutar: npx tsx scripts/verify-evolution-note-rips.ts
 */
import 'fake-indexeddb/auto'
import Dexie, { type Table } from 'dexie'
import {
  EVOLUTION_NOTE_RIPS_SCHEMA,
  registerEvolutionNoteRipsGuards,
} from '../src/db/evolutionNoteRipsIntegrity'
import {
  createRipsConsultation,
  createRipsProcedure,
  deleteEvolutionNoteRecord,
  listRipsByEvolutionNote,
  materializeRipsFromEvolutionNote,
  saveEvolutionNoteRecord,
} from '../src/db/evolutionNoteRipsRepository'
import {
  EVOLUTION_NOTE_RIPS_DELETE_BLOCKED_MESSAGE,
  EVOLUTION_NOTE_SINGLE_CONSULTATION_MESSAGE,
  EvolutionNoteRipsError,
  RIPS_EVOLUTION_NOTE_TRANSACTION_MESSAGE,
  RIPS_WITHOUT_EVOLUTION_NOTE_MESSAGE,
  type EvolutionNoteRecord,
  type RipsConsultationRecord,
  type RipsProcedureRecord,
} from '../src/types/evolutionNoteRips'

class EvolutionNoteRipsTestDatabase extends Dexie {
  evolution_notes!: Table<EvolutionNoteRecord, string>
  rips_consultations!: Table<RipsConsultationRecord, string>
  rips_procedures!: Table<RipsProcedureRecord, string>

  constructor() {
    super(`EvolutionNoteRipsTest-${crypto.randomUUID()}`)
    this.version(1).stores({ ...EVOLUTION_NOTE_RIPS_SCHEMA })
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function sampleNote(overrides: Partial<EvolutionNoteRecord> = {}): EvolutionNoteRecord {
  return {
    id: 'note-1',
    patient_id: 'patient-1',
    main_diagnosis_cie10: 'K02.1',
    related_diagnoses_cie10: ['K05.1', 'K04.0'],
    purpose_of_care: '44',
    date_time: '2026-10-09T15:30:00.000Z',
    procedures_cups: [
      { cups_code: '232101', tooth_number: 16, description: 'Resina' },
      { cups_code: '232101', tooth_number: 26, description: 'Resina' },
      { cups_code: '997102', tooth_number: 36, description: 'Detartraje por pieza' },
    ],
    consultation_cups: '890203',
    created_at: '2026-10-09T15:00:00.000Z',
    updated_at: '2026-10-09T15:00:00.000Z',
    ...overrides,
  }
}

async function expectError(run: () => Promise<unknown>, messageIncludes: string): Promise<void> {
  try {
    await run()
  } catch (error) {
    assert(error instanceof EvolutionNoteRipsError, `Se esperaba EvolutionNoteRipsError y llegó ${error}`)
    assert(
      error.message.includes(messageIncludes),
      `Mensaje inesperado: ${error.message}`,
    )
    return
  }
  throw new Error(`La operación debió fallar con: ${messageIncludes}`)
}

async function main(): Promise<void> {
  const database = new EvolutionNoteRipsTestDatabase()
  registerEvolutionNoteRipsGuards(database, { isRestoreUnlocked: () => false })
  await database.open()

  const note = await saveEvolutionNoteRecord(database, sampleNote())
  assert(note.main_diagnosis_cie10 === 'K021', 'El CIE-10 principal debe normalizarse sin punto')
  assert(note.related_diagnoses_cie10.join(',') === 'K051,K040', 'Los CIE-10 relacionados se normalizan')
  assert(note.consultation_cups === '890203', 'El CUPS de consulta se conserva')

  const orphanProcedure = {
    id: 'orphan',
    evolution_note_id: 'note-ausente',
    patient_id: 'patient-1',
    fecha_inicio_atencion: note.date_time,
    finalidad_tecnologia_salud: note.purpose_of_care,
    cod_diagnostico_principal: note.main_diagnosis_cie10,
    cod_diagnostico_relacionado: null,
    cod_procedimiento: '232101',
    pieza_dental: 16,
    cuadrante_fdi: null,
    arcada: null,
    vr_servicio: 0,
    consecutivo: 1,
    created_at: note.created_at,
    updated_at: note.updated_at,
  } as const

  await expectError(
    () =>
      database.transaction('rw', database.rips_procedures, async () => {
        await database.rips_procedures.add({ ...orphanProcedure })
      }),
    RIPS_EVOLUTION_NOTE_TRANSACTION_MESSAGE,
  )

  await expectError(
    () =>
      database.transaction('rw', database.evolution_notes, database.rips_procedures, async () => {
        await database.rips_procedures.add({ ...orphanProcedure, id: 'orphan-2' })
      }),
    RIPS_WITHOUT_EVOLUTION_NOTE_MESSAGE,
  )

  await expectError(
    () =>
      database.transaction('rw', database.evolution_notes, database.rips_procedures, async () => {
        await database.rips_procedures.add({ ...orphanProcedure, id: 'orphan-3', evolution_note_id: '   ' })
      }),
    RIPS_WITHOUT_EVOLUTION_NOTE_MESSAGE,
  )

  await expectError(
    () => createRipsProcedure(database, 'note-ausente', { cups_code: '232101' }),
    RIPS_WITHOUT_EVOLUTION_NOTE_MESSAGE,
  )

  const consultation = await createRipsConsultation(database, note.id, { vr_servicio: 80000 })
  assert(consultation.evolution_note_id === note.id, 'La consulta debe apuntar a la nota')
  assert(consultation.cod_consulta === '890203', 'La consulta copia el CUPS de la nota')
  assert(consultation.cod_diagnostico_principal === 'K021', 'La consulta copia el CIE-10 de la nota')
  assert(consultation.finalidad_tecnologia_salud === '44', 'La consulta copia la finalidad')
  assert(consultation.cod_diagnostico_relacionado_1 === 'K051', 'Relacionado 1')
  assert(consultation.cod_diagnostico_relacionado_2 === 'K040', 'Relacionado 2')

  await expectError(
    () => createRipsConsultation(database, note.id),
    EVOLUTION_NOTE_SINGLE_CONSULTATION_MESSAGE,
  )

  const first = await createRipsProcedure(database, note.id, {
    cups_code: '232101',
    tooth_number: 16,
    vr_servicio: 120000,
  })
  const second = await createRipsProcedure(database, note.id, {
    cups_code: '232101',
    tooth_number: 26,
    vr_servicio: 120000,
  })
  assert(first.pieza_dental === 16 && second.pieza_dental === 26, 'Cada procedimiento conserva su pieza')
  assert(first.evolution_note_id === note.id && second.evolution_note_id === note.id, 'FK obligatoria')

  const listed = await listRipsByEvolutionNote(database, note.id)
  assert(listed.consultation?.id === consultation.id, 'La consulta se lee por evolution_note_id')
  assert(listed.procedures.length === 2, 'Los procedimientos se leen por evolution_note_id')

  await expectError(() => deleteEvolutionNoteRecord(database, note.id), EVOLUTION_NOTE_RIPS_DELETE_BLOCKED_MESSAGE)

  const replaced = await materializeRipsFromEvolutionNote(database, note.id, {
    vrConsulta: 50000,
    vrProcedimiento: [10, 20, 30],
  })
  assert(replaced.consultation?.cod_consulta === '890203', 'La regeneración conserva la consulta')
  assert(replaced.procedures.length === 3, 'Una fila RIPS por cada procedures_cups')
  assert(
    replaced.procedures.map((row) => row.consecutivo).join(',') === '1,2,3',
    'El consecutivo sigue el orden de la nota',
  )
  assert(replaced.procedures[0]?.pieza_dental === 16, 'La primera resina queda en la pieza 16')
  assert(replaced.procedures[1]?.pieza_dental === 26, 'La segunda resina queda en la pieza 26')
  assert(
    replaced.procedures.every((row) => row.evolution_note_id === note.id),
    'Todos los procedimientos regenerados apuntan a la nota',
  )

  await database.rips_consultations.where('evolution_note_id').equals(note.id).delete()
  await database.rips_procedures.where('evolution_note_id').equals(note.id).delete()
  await deleteEvolutionNoteRecord(database, note.id)
  assert((await database.evolution_notes.get(note.id)) == null, 'La nota sin RIPS sí se puede eliminar')

  await database.delete()
  console.log('Relación nota de evolución → RIPS verificada')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
