import { useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import type { EvolutionNote } from '@/types/evolutionNote'
import {
  EVOLUTION_NOTE_IMMUTABILITY_MESSAGE,
  createEmptyEvolutionNote,
  isEvolutionNoteImmutable,
} from '@/types/evolutionNote'
import { sortEvolutionNotesChronologically } from '@/utils/recordIntegrity'
import { validateEvolutionNote } from '@/utils/evolutionNoteValidation'
import {
  CLINICAL_HISTORY_SECTION_NUMBERS,
  CLINICAL_SECTION_TITLE_CLASS,
  clinicalSectionTitle,
} from '@/constants/clinicalHistorySections'
import { logAuditEvent } from '@/services/auditService'
import {
  EvolutionNoteImmutableError,
  createAddendumDraftNote,
  persistSignedEvolutionNoteCreate,
  removeEvolutionNoteFromList,
  updateEvolutionNoteInList,
} from '@/services/evolutionNoteService'
import { EvolutionNoteCard } from './EvolutionNoteCard'

interface EvolutionNotesFormProps {
  notes: EvolutionNote[]
  onChange: (notes: EvolutionNote[]) => void
  patientId?: string
  parentRecordId?: string
  professionalName?: string
  professionalLicense?: string
  authorUserId?: string
  authorEmail?: string
  disabled?: boolean
  allowAddendums?: boolean
  /** Si es false, no se muestra el alta de notas (p. ej. solo lectura). Por defecto sí se permite. */
  allowNewNotes?: boolean
}

export function EvolutionNotesForm({
  notes,
  onChange,
  patientId = '',
  parentRecordId,
  professionalName = '',
  professionalLicense = '',
  authorUserId = '',
  authorEmail = '',
  disabled = false,
  allowAddendums = true,
  allowNewNotes = true,
}: EvolutionNotesFormProps) {
  const { user } = useAuth()
  const [blockedMessage, setBlockedMessage] = useState('')

  const logBlockedMutation = (noteId: string, action: 'UPDATE' | 'DELETE') => {
    if (!user) return
    void logAuditEvent({
      action: 'BLOCK_EVOLUTION_MUTATION',
      resourceType: 'clinical_record',
      resourceId: noteId,
      details: `Intento de ${action} bloqueado — Res. 1995/1999`,
      user,
    })
  }

  const showBlocked = (message: string) => {
    setBlockedMessage(message)
    window.setTimeout(() => setBlockedMessage(''), 8000)
  }

  const canAddNote = allowNewNotes

  const addNote = () => {
    if (!canAddNote) return
    onChange([
      ...notes,
      createEmptyEvolutionNote(professionalName, professionalLicense, authorUserId, authorEmail),
    ])
  }

  const updateNote = (id: string, patch: Partial<EvolutionNote>) => {
    try {
      onChange(updateEvolutionNoteInList(notes, id, patch))
    } catch (error) {
      if (error instanceof EvolutionNoteImmutableError) {
        logBlockedMutation(id, 'UPDATE')
        showBlocked(error.message)
        return
      }
      throw error
    }
  }

  const removeNote = (id: string) => {
    try {
      onChange(removeEvolutionNoteFromList(notes, id))
    } catch (error) {
      if (error instanceof EvolutionNoteImmutableError) {
        logBlockedMutation(id, 'DELETE')
        showBlocked(error.message)
        return
      }
      throw error
    }
  }

  const signNote = async (id: string) => {
    const note = notes.find((item) => item.id === id)
    if (!note || isEvolutionNoteImmutable(note)) {
      showBlocked(EVOLUTION_NOTE_IMMUTABILITY_MESSAGE)
      return
    }

    const issues = validateEvolutionNote(note)
    if (issues.length > 0) {
      showBlocked(issues[0]?.message ?? 'Complete la nota antes de firmar.')
      return
    }

    if (!patientId) {
      showBlocked('No se pudo identificar al paciente para registrar la evolución.')
      return
    }

    try {
      const signed = await persistSignedEvolutionNoteCreate(patientId, note)
      onChange(notes.map((item) => (item.id === id ? signed : item)))
      if (user) {
        await logAuditEvent({
          action: 'CREATE_EVOLUTION_NOTE',
          resourceType: 'clinical_record',
          resourceId: signed.id,
          details: `Nota de evolución firmada — ${signed.procedure?.slice(0, 80) ?? ''}`,
          user,
        })
      }
    } catch {
      showBlocked('No se pudo firmar y grabar la nota de evolución.')
    }
  }

  const addAddendum = (parentId: string) => {
    const parent = notes.find((item) => item.id === parentId)
    if (!parent || !isEvolutionNoteImmutable(parent)) {
      showBlocked('Solo puede agregar aclaratorias a evoluciones ya firmadas.')
      return
    }
    onChange([
      ...notes,
      createAddendumDraftNote(
        parent,
        professionalName,
        professionalLicense,
        authorUserId,
        authorEmail,
      ),
    ])
  }

  const sortedNotes = sortEvolutionNotesChronologically(notes)

  return (
    <section className="card">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className={CLINICAL_SECTION_TITLE_CLASS}>
            {clinicalSectionTitle(
              CLINICAL_HISTORY_SECTION_NUMBERS.evolucion,
              'Evolución Clínica (Notas de Evolución)',
            )}
          </h3>
          <p className="mt-1 text-xs text-slate-500">
            Res. 1995/1999: el bloqueo es por folio. Una evolución firmada no se edita ni se
            elimina; use «Agregar Nota de Aclaración». El odontograma y el resto del expediente
            siguen abiertos.
          </p>
        </div>
        {canAddNote && (
          <button type="button" onClick={addNote} className="btn-primary shrink-0 text-sm">
            Nueva Nota de Evolución
          </button>
        )}
      </div>

      {blockedMessage && (
        <div
          role="alert"
          className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900"
        >
          {blockedMessage}
        </div>
      )}

      {notes.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center">
          <p className="text-sm text-slate-600">
            No hay notas de evolución. Registre cada cita con fecha, procedimiento y nota clínica.
          </p>
          {canAddNote && (
            <button type="button" onClick={addNote} className="btn-primary mt-4 text-sm">
              Nueva Nota de Evolución
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-xs text-slate-500">
            Orden cronológico: de la nota más antigua a la más reciente.
          </p>
          {sortedNotes.map((note, index) => (
            <EvolutionNoteCard
              key={note.id}
              note={note}
              index={index}
              disabled={disabled}
              parentRecordId={parentRecordId}
              patientId={patientId}
              allowAddendums={allowAddendums}
              onChange={(patch) => updateNote(note.id, patch)}
              onRemove={() => removeNote(note.id)}
              onSign={() => signNote(note.id)}
              onAddAddendum={() => addAddendum(note.id)}
            />
          ))}
        </div>
      )}
    </section>
  )
}
