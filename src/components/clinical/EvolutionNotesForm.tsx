import { useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import type { OrthodonticsPaymentRecord, PaymentRecord } from '@/types/clinicalRecord'
import type { EvolutionNote, EvolutionNotePatch } from '@/types/evolutionNote'
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
import { EvolutionNoteRipsMetadataError } from '@/types/evolutionNoteRips'
import { RipsShieldModal } from '@/components/rips/RipsShieldModal'
import { evaluateEvolutionRipsShield } from '@/utils/ripsShieldValidation'
import type { RipsShieldMismatch } from '@/types/consultationCheckout'
import { KioskRemoteTrigger } from '@/components/kiosk/KioskRemoteTrigger'
import { EvolutionNoteCard } from './EvolutionNoteCard'
import type { PacienteRipsIdentidad } from '@/utils/evolutionRipsPayload'

interface EvolutionNotesFormProps {
  notes: EvolutionNote[]
  onChange: (notes: EvolutionNote[]) => void
  patientId?: string
  paciente?: PacienteRipsIdentidad
  parentRecordId?: string
  pagosPaciente?: Array<PaymentRecord | OrthodonticsPaymentRecord>
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
  paciente,
  parentRecordId,
  pagosPaciente = [],
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
  const [shieldMismatches, setShieldMismatches] = useState<RipsShieldMismatch[]>([])

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

  const updateNote = (id: string, patch: EvolutionNotePatch) => {
    try {
      onChange(updateEvolutionNoteInList(notes, id, patch))
    } catch (error) {
      if (error instanceof EvolutionNoteImmutableError) {
        logBlockedMutation(id, 'UPDATE')
        showBlocked(error.message)
        return
      }
      if (error instanceof EvolutionNoteRipsMetadataError) {
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

    if (user) {
      const mismatches = evaluateEvolutionRipsShield(note, user)
      if (mismatches.length > 0) {
        setShieldMismatches(mismatches)
        return
      }
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
  const addenda = sortedNotes.filter(
    (note) => note.kind === 'addendum' && note.parentEvolutionNoteId,
  )
  const placed = new Set<string>()
  const notesInReadingOrder: EvolutionNote[] = []
  for (const note of sortedNotes) {
    if (placed.has(note.id)) continue
    if (note.kind === 'addendum' && note.parentEvolutionNoteId) continue
    notesInReadingOrder.push(note)
    placed.add(note.id)
    for (const addendum of addenda) {
      if (addendum.parentEvolutionNoteId !== note.id || placed.has(addendum.id)) continue
      notesInReadingOrder.push(addendum)
      placed.add(addendum.id)
    }
  }
  for (const addendum of addenda) {
    if (placed.has(addendum.id)) continue
    notesInReadingOrder.push(addendum)
    placed.add(addendum.id)
  }
  const evolutionOrdinal = new Map<string, number>()
  let ordinal = 0
  for (const note of notesInReadingOrder) {
    if (note.kind === 'addendum') continue
    evolutionOrdinal.set(note.id, ordinal)
    ordinal += 1
  }

  const draftForTablet = [...notes]
    .reverse()
    .find((note) => !isEvolutionNoteImmutable(note))
  const evolutionTabletText = draftForTablet
    ? [
        draftForTablet.procedure?.trim() && `Procedimiento: ${draftForTablet.procedure.trim()}`,
        draftForTablet.clinicalNote?.trim() && `Nota: ${draftForTablet.clinicalNote.trim()}`,
        draftForTablet.prescriptions?.trim() && `Prescripciones: ${draftForTablet.prescriptions.trim()}`,
      ]
        .filter(Boolean)
        .join('\n\n')
    : ''

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
            Cada procedimiento lleva, en el mismo bloque, la zona o el diente y el diagnóstico.
            Mientras la evolución esté abierta puede eliminar el procedimiento. Cuando se cierra,
            la nota no se edita ni se borra (Res. 1995/1999): use «Nota aclaratoria».
          </p>
        </div>
        {canAddNote && (
          <button type="button" onClick={addNote} className="btn-primary shrink-0 text-sm">
            Nueva Nota de Evolución
          </button>
        )}
      </div>

      {!disabled && patientId && draftForTablet && (
        <div className="mb-4">
          <KioskRemoteTrigger
            type="EVOLUTION"
            documentId={draftForTablet.id}
            patientId={patientId}
            dataToSign={{
              title: draftForTablet.procedure?.trim() || 'Nota de evolución',
              contentText: evolutionTabletText || 'Revise la nota de evolución y firme en la tableta.',
              formData: { noteId: draftForTablet.id },
            }}
            onSigned={({ signatureBase64 }) => {
              updateNote(draftForTablet.id, { patientSignatureDataUrl: signatureBase64 })
            }}
          />
        </div>
      )}

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
            De la nota más antigua a la más reciente. La aclaratoria queda debajo de la evolución
            que corrige.
          </p>
          {notesInReadingOrder.map((note) => (
            <EvolutionNoteCard
              key={note.id}
              note={note}
              index={evolutionOrdinal.get(note.id) ?? 0}
              disabled={disabled}
              parentRecordId={parentRecordId}
              patientId={patientId}
              paciente={paciente}
              pagosPaciente={pagosPaciente}
              notasPaquete={sortedNotes}
              allowAddendums={allowAddendums}
              onChange={(patch) => updateNote(note.id, patch)}
              onRemove={() => removeNote(note.id)}
              onSign={() => signNote(note.id)}
              onAddAddendum={() => addAddendum(note.id)}
            />
          ))}
        </div>
      )}
      <RipsShieldModal
        open={shieldMismatches.length > 0}
        mismatches={shieldMismatches}
        onChangeProcedure={() => setShieldMismatches([])}
      />
    </section>
  )
}
