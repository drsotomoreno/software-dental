import { useCallback, useState } from 'react'
import { isOdontologyConsultationCups } from '@/constants/rips'
import {
  buildRipsConsultationFromNote,
  buildRipsProcedureFromNote,
  type EvolutionNoteRipsDatabase,
} from '@/db/evolutionNoteRipsRepository'
import { getEvolutionNoteRipsDatabase } from '@/services/evolutionNoteRipsService'
import {
  EVOLUTION_NOTE_SINGLE_CONSULTATION_MESSAGE,
  EvolutionNoteRipsError,
  normalizeCupsCode,
  normalizeEvolutionNoteRecord,
  type EvolutionNoteCupsProcedure,
  type EvolutionNoteRecord,
} from '@/types/evolutionNoteRips'
import { generateId } from '@/utils/crypto'

/** CUPS elegido en el formulario. La interfaz no crea filas RIPS por fuera de este contrato. */
export interface EvolutionNoteCupsSelection {
  cupsCode: string
  description?: string
  toothNumber?: number | null
}

export interface SaveEvolutionNoteCommand {
  patientId: string
  clinicalRecordId?: string
  clinicalEvolutionNoteId?: string
  professionalId?: string
  clinicId?: string
  clinicalNote: string
  mainDiagnosisCie10: string
  relatedDiagnosesCie10?: string[]
  purposeOfCare: string
  dateTime: string
  selectedCups: EvolutionNoteCupsSelection[]
}

export interface SavedEvolutionNoteResult {
  evolutionNoteId: string
  note: EvolutionNoteRecord
  consultationId: string | null
  procedureIds: string[]
}

function requireCommandText(value: string, message: string): string {
  const trimmed = value.trim()
  if (!trimmed) throw new EvolutionNoteRipsError(message)
  return trimmed
}

function toProcedure(selection: EvolutionNoteCupsSelection): EvolutionNoteCupsProcedure {
  const tooth = selection.toothNumber
  return {
    cups_code: normalizeCupsCode(selection.cupsCode),
    description: selection.description?.trim() || undefined,
    tooth_number: tooth == null ? null : tooth,
  }
}

/**
 * Pasos A–C en una sola transacción Dexie.
 * Si la generación RIPS falla, la nota tampoco queda guardada.
 */
export async function saveEvolutionNoteTransaction(
  database: EvolutionNoteRipsDatabase,
  command: SaveEvolutionNoteCommand,
): Promise<SavedEvolutionNoteResult> {
  const patientId = requireCommandText(command.patientId, 'Seleccione el paciente antes de firmar la nota.')
  const clinicalNote = requireCommandText(command.clinicalNote, 'Escriba la nota de evolución antes de firmar.')
  const mainDiagnosis = requireCommandText(
    command.mainDiagnosisCie10,
    'Seleccione el diagnóstico principal CIE-10.',
  )
  const purposeOfCare = requireCommandText(
    command.purposeOfCare,
    'Seleccione la finalidad de la atención.',
  )
  const dateTime = requireCommandText(command.dateTime, 'Indique la fecha y hora de la atención.')
  if (command.selectedCups.length === 0) {
    throw new EvolutionNoteRipsError('Seleccione al menos un procedimiento CUPS.')
  }

  const consultationCups = command.selectedCups.filter((item) =>
    isOdontologyConsultationCups(item.cupsCode),
  )
  const procedureCups = command.selectedCups.filter(
    (item) => !isOdontologyConsultationCups(item.cupsCode),
  )
  if (consultationCups.length > 1) {
    throw new EvolutionNoteRipsError(EVOLUTION_NOTE_SINGLE_CONSULTATION_MESSAGE)
  }

  const now = new Date().toISOString()
  const evolutionNoteId = generateId()
  const draft = normalizeEvolutionNoteRecord({
    id: evolutionNoteId,
    patient_id: patientId,
    clinical_record_id: command.clinicalRecordId,
    clinical_evolution_note_id: command.clinicalEvolutionNoteId,
    professional_id: command.professionalId,
    clinic_id: command.clinicId,
    main_diagnosis_cie10: mainDiagnosis,
    related_diagnoses_cie10: command.relatedDiagnosesCie10 ?? [],
    purpose_of_care: purposeOfCare,
    date_time: dateTime,
    clinical_note: clinicalNote,
    procedures_cups: procedureCups.map(toProcedure),
    consultation_cups: consultationCups[0] ? normalizeCupsCode(consultationCups[0].cupsCode) : null,
    created_at: now,
    updated_at: now,
  })

  return database.transaction(
    'rw',
    database.evolution_notes,
    database.rips_consultations,
    database.rips_procedures,
    async () => {
      // A. La nota es la fuente de verdad.
      await database.evolution_notes.put(draft)

      // B. El id se confirma en la colección, no se inventa al crear el RIPS.
      const saved = await database.evolution_notes.get(evolutionNoteId)
      if (!saved) {
        throw new EvolutionNoteRipsError('No se pudo recuperar la nota de evolución recién guardada.')
      }

      // C. Cada CUPS de la nota deriva su RIPS. No hay alta manual.
      let consultationId: string | null = null
      if (saved.consultation_cups) {
        const consultation = buildRipsConsultationFromNote(saved, { consecutivo: 1 })
        await database.rips_consultations.add(consultation)
        consultationId = consultation.id
      }

      const procedureIds: string[] = []
      for (let index = 0; index < saved.procedures_cups.length; index += 1) {
        const procedure = saved.procedures_cups[index]
        if (!procedure) continue
        const row = buildRipsProcedureFromNote(saved, procedure, { consecutivo: index + 1 })
        await database.rips_procedures.add(row)
        procedureIds.push(row.id)
      }

      return {
        evolutionNoteId: saved.id,
        note: saved,
        consultationId,
        procedureIds,
      }
    },
  ) as Promise<SavedEvolutionNoteResult>
}

export function useSaveEvolutionNote() {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const saveEvolutionNote = useCallback(async (command: SaveEvolutionNoteCommand) => {
    setSaving(true)
    setError(null)
    try {
      return await saveEvolutionNoteTransaction(getEvolutionNoteRipsDatabase(), command)
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : 'No se pudo firmar y guardar la nota.'
      setError(message)
      throw caught
    } finally {
      setSaving(false)
    }
  }, [])

  return { saveEvolutionNote, saving, error }
}
