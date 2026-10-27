import { isNonRipsEvolutionNote, isEvolutionNoteAddendum, type EvolutionNote } from '@/types/evolutionNote'
import { noteHasCatalogServices, resolveEvolutionNoteRipsMode } from '@/utils/evolutionCatalogServices'
import { collectEvolutionAssociationIssues } from '@/utils/evolutionNoteAssociation'
import { MIN_SIGNATURE_STROKES } from '@/types/signature'

export interface EvolutionNoteValidationIssue {
  noteId: string
  field?: string
  message: string
}

function validarFirma(
  noteId: string,
  dataUrl: string | undefined,
  strokeCount: number | undefined,
  field: string,
  quien: string,
): EvolutionNoteValidationIssue | null {
  if (!dataUrl) {
    return {
      noteId,
      field,
      message: `La firma del ${quien} es obligatoria.`,
    }
  }
  if ((strokeCount ?? 0) < MIN_SIGNATURE_STROKES) {
    return {
      noteId,
      field,
      message: `La firma del ${quien} no es válida.`,
    }
  }
  return null
}

/** Servicios sin CUPS RIPS no generan advertencias ni bloqueos de radicación. */
export function isEvolutionNoteExemptFromRips(
  note: Pick<EvolutionNote, 'requiereCupsRips'>,
): boolean {
  return isNonRipsEvolutionNote(note)
}

export function validateEvolutionNote(note: EvolutionNote): EvolutionNoteValidationIssue[] {
  const issues: EvolutionNoteValidationIssue[] = []

  if (isEvolutionNoteAddendum(note)) {
    if (!note.addendumReason?.trim()) {
      issues.push({
        noteId: note.id,
        field: 'addendumReason',
        message: 'El motivo de la nota aclaratoria es obligatorio.',
      })
    }
    if (!note.clinicalNote?.trim()) {
      issues.push({
        noteId: note.id,
        field: 'clinicalNote',
        message: 'El contenido de la aclaratoria es obligatorio.',
      })
    }
    if (!note.professionalSignatureDataUrl) {
      issues.push({
        noteId: note.id,
        field: 'professionalSignatureDataUrl',
        message: 'La firma digital es obligatoria para la nota aclaratoria.',
      })
    } else if (
      (note.professionalSignatureMeta?.strokeCount ?? 0) < MIN_SIGNATURE_STROKES
    ) {
      issues.push({
        noteId: note.id,
        field: 'professionalSignatureDataUrl',
        message: 'La firma digital no es válida.',
      })
    }
    return issues
  }

  if (!note.date?.trim()) {
    issues.push({ noteId: note.id, field: 'date', message: 'La fecha y hora de la evolución son obligatorias.' })
  }

  const ripsMode = resolveEvolutionNoteRipsMode(note)

  if (!noteHasCatalogServices(note) && !note.procedure?.trim() && !note.clinicalNote?.trim()) {
    issues.push({
      noteId: note.id,
      field: 'dentalServiceId',
      message: 'Seleccione al menos un procedimiento del catálogo o describa el procedimiento.',
    })
  }

  if (!note.clinicalNote?.trim()) {
    issues.push({
      noteId: note.id,
      field: 'clinicalNote',
      message: 'La Nota de Evolución es obligatoria.',
    })
  }

  for (const issue of collectEvolutionAssociationIssues(note)) {
    issues.push({ noteId: note.id, field: issue.field, message: issue.message })
  }

  const firmaPaciente = validarFirma(
    note.id,
    note.patientSignatureDataUrl,
    note.patientSignatureMeta?.strokeCount,
    'patientSignatureDataUrl',
    'paciente',
  )
  const firmaOdontologo = validarFirma(
    note.id,
    note.professionalSignatureDataUrl,
    note.professionalSignatureMeta?.strokeCount,
    'professionalSignatureDataUrl',
    'odontólogo',
  )
  if (firmaPaciente) issues.push(firmaPaciente)
  if (firmaOdontologo) issues.push(firmaOdontologo)

  if (ripsMode === 'non_rips') {
    return issues
  }

  if (!note.procedure?.trim()) {
    issues.push({
      noteId: note.id,
      field: 'procedure',
      message: 'Indique el procedimiento realizado (CUPS o descripción).',
    })
  }

  return issues
}

export function validateEvolutionNotes(notes: EvolutionNote[]): EvolutionNoteValidationIssue[] {
  return notes.flatMap(validateEvolutionNote)
}

export function getFirstEvolutionNoteIssue(
  notes: EvolutionNote[],
): EvolutionNoteValidationIssue | null {
  return validateEvolutionNotes(notes)[0] ?? null
}
