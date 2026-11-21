import { isNonRipsEvolutionNote, isEvolutionNoteAddendum, type EvolutionNote } from '@/types/evolutionNote'
import { noteHasCatalogServices, resolveEvolutionNoteRipsMode } from '@/utils/evolutionCatalogServices'
import {
  formatCanonicalRipsErrors,
  resolveAndValidateCanonicalEvolutionRips,
  type CanonicalRipsValidationError,
} from '@/utils/canonicalEvolutionRips'
import type { PacienteRipsIdentidad } from '@/utils/evolutionRipsPayload'
import { collectEvolutionAssociationIssues } from '@/utils/evolutionNoteAssociation'
import { MIN_SIGNATURE_STROKES } from '@/types/signature'

export interface EvolutionNoteValidationIssue {
  noteId: string
  field?: string
  message: string
  code?: string
  fix?: string
  scope?: CanonicalRipsValidationError['scope']
}

export interface EvolutionNoteValidationContext {
  paciente?: PacienteRipsIdentidad | Record<string, unknown>
  clinicConfig?: Record<string, unknown>
}

function validarFirmaOdontologo(
  noteId: string,
  dataUrl: string | undefined,
  strokeCount: number | undefined,
): EvolutionNoteValidationIssue | null {
  if (!dataUrl) {
    return {
      noteId,
      field: 'professionalSignatureDataUrl',
      message: 'La firma digital del odontólogo tratante es obligatoria para cerrar la evolución.',
    }
  }
  if ((strokeCount ?? 0) < MIN_SIGNATURE_STROKES) {
    return {
      noteId,
      field: 'professionalSignatureDataUrl',
      message: 'La firma digital del odontólogo no es válida.',
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

/**
 * Cierre de evolución: firma del odontólogo + ID/ReTHUS + contrato RIPS canónico.
 * No exige ni admite firma del paciente (Res. 1995/1999).
 */
export function validateEvolutionNote(
  note: EvolutionNote,
  context: EvolutionNoteValidationContext = {},
): EvolutionNoteValidationIssue[] {
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
    if (!note.authorUserId?.trim()) {
      issues.push({
        noteId: note.id,
        field: 'authorUserId',
        message: 'El ID del profesional tratante es obligatorio.',
      })
    }
    if (!note.professionalLicense?.trim()) {
      issues.push({
        noteId: note.id,
        field: 'professionalLicense',
        message: 'El código ReTHUS / documento del odontólogo es obligatorio.',
      })
    }
    const firmaAddendum = validarFirmaOdontologo(
      note.id,
      note.professionalSignatureDataUrl,
      note.professionalSignatureMeta?.strokeCount,
    )
    if (firmaAddendum) issues.push(firmaAddendum)
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

  if (!note.authorUserId?.trim()) {
    issues.push({
      noteId: note.id,
      field: 'authorUserId',
      message: 'El ID del profesional tratante es obligatorio para firmar la evolución.',
    })
  }

  if (!note.professionalLicense?.trim()) {
    issues.push({
      noteId: note.id,
      field: 'professionalLicense',
      message: 'El código ReTHUS / documento del odontólogo es obligatorio.',
    })
  }

  if (!note.professionalName?.trim()) {
    issues.push({
      noteId: note.id,
      field: 'professionalName',
      message: 'El nombre del profesional tratante es obligatorio.',
    })
  }

  const firmaOdontologo = validarFirmaOdontologo(
    note.id,
    note.professionalSignatureDataUrl,
    note.professionalSignatureMeta?.strokeCount,
  )
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

  const { validation } = resolveAndValidateCanonicalEvolutionRips(
    note,
    context.paciente ?? {},
    context.clinicConfig ?? {
      documentNumber: note.professionalLicense,
    },
    'sign',
  )
  for (const error of validation.errors) {
    issues.push({
      noteId: note.id,
      field: error.field,
      message: error.message,
      code: error.code,
      fix: error.fix,
      scope: error.scope,
    })
  }

  return issues
}

export function validateEvolutionNotes(
  notes: EvolutionNote[],
  context: EvolutionNoteValidationContext = {},
): EvolutionNoteValidationIssue[] {
  return notes.flatMap((note) => validateEvolutionNote(note, context))
}

export function getFirstEvolutionNoteIssue(
  notes: EvolutionNote[],
  context: EvolutionNoteValidationContext = {},
): EvolutionNoteValidationIssue | null {
  return validateEvolutionNotes(notes, context)[0] ?? null
}

export function formatEvolutionValidationIssues(
  issues: EvolutionNoteValidationIssue[],
): string {
  return formatCanonicalRipsErrors(
    issues.map((issue) => ({
      code: issue.code || 'EVOLUTION_VALIDATION',
      field: issue.field || 'note',
      message: issue.message,
      fix: issue.fix,
      scope: issue.scope,
    })),
  )
}
