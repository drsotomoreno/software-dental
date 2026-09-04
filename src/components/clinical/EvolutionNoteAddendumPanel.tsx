import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/database'
import { DigitalSignatureCanvas } from '@/components/signature/DigitalSignatureCanvas'
import { SignConfirmationModal } from '@/components/signature/SignConfirmationModal'
import { confirmUserPassword } from '@/services/authService'
import {
  computeEvolutionAddendumContentHash,
  persistEvolutionNoteAddendum,
} from '@/services/evolutionNoteService'
import { logAuditEvent } from '@/services/auditService'
import { validateSignatureCapture } from '@/services/signatureService'
import type { AuthUser } from '@/types/auth'
import type { EvolutionNote } from '@/types/evolutionNote'
import type { EvolutionNoteAddendum } from '@/types/evolutionNoteAddendum'
import type { SignatureCaptureResult } from '@/types/signature'
import { formatDate, generateId } from '@/utils'
import { collectSignatureContext } from '@/utils/clientContext'

interface EvolutionNoteAddendumPanelProps {
  parentNote: EvolutionNote
  patientId: string
  parentRecordId?: string
  user: AuthUser
}

export function EvolutionNoteAddendumPanel({
  parentNote,
  patientId,
  parentRecordId,
  user,
}: EvolutionNoteAddendumPanelProps) {
  const addendums = useLiveQuery(
    () =>
      db.evolutionNoteAddendums
        .where('parentEvolutionNoteId')
        .equals(parentNote.id)
        .sortBy('signedAt'),
    [parentNote.id],
  )

  const [expanded, setExpanded] = useState(false)
  const [reason, setReason] = useState('')
  const [content, setContent] = useState('')
  const [signature, setSignature] = useState<SignatureCaptureResult | null>(null)
  const [showConfirm, setShowConfirm] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (!parentNote.contentHash) return null

  const resetForm = () => {
    setReason('')
    setContent('')
    setSignature(null)
    setShowConfirm(false)
    setExpanded(false)
  }

  const handlePrepareSign = (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!reason.trim() || !content.trim()) {
      setError('Indique el motivo y el contenido de la aclaratoria.')
      return
    }
    const sigError = validateSignatureCapture(signature)
    if (sigError) {
      setError(sigError)
      return
    }
    setShowConfirm(true)
  }

  const handleConfirmSign = async (password: string) => {
    const valid = await confirmUserPassword(user.id, password)
    if (!valid) {
      return {
        ok: false as const,
        error: 'Contraseña incorrecta. Solo el usuario autenticado puede firmar.',
      }
    }

    setBusy(true)
    try {
      const context = await collectSignatureContext()
      const now = context.capturedAt
      const draft: Omit<EvolutionNoteAddendum, 'contentHash'> = {
        id: generateId(),
        patientId,
        parentRecordId,
        parentEvolutionNoteId: parentNote.id,
        parentEvolutionNoteHash: parentNote.contentHash!,
        reason: reason.trim(),
        content: content.trim(),
        authorUserId: user.id,
        authorEmail: user.email,
        authorName: `${user.firstName} ${user.lastName}`,
        authorDocument: user.documentNumber,
        professionalLicense: user.documentNumber,
        professionalSignatureDataUrl: signature!.dataUrl,
        professionalSignatureMeta: signature!.metadata,
        signedAt: now,
        createdAt: now,
        deviceInfo: context.userAgent,
        ipAddress: context.ipAddress,
        timezone: context.timezone,
      }
      const contentHash = await computeEvolutionAddendumContentHash(draft)
      const addendum: EvolutionNoteAddendum = { ...draft, contentHash }

      await persistEvolutionNoteAddendum(addendum)

      await logAuditEvent({
        action: 'CREATE_EVOLUTION_ADDENDUM',
        resourceType: 'clinical_record',
        resourceId: parentRecordId ?? parentNote.id,
        details: `Nota aclaratoria evolución — ${reason.trim().slice(0, 80)}`,
        user,
      })

      setMessage('Nota aclaratoria registrada. La evolución original permanece intacta.')
      resetForm()
      return { ok: true as const }
    } catch {
      return { ok: false as const, error: 'No se pudo registrar la nota aclaratoria.' }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50/50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium text-amber-900">
          Evolución firmada — inmutable (Res. 1995/1999)
        </p>
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="btn-secondary text-xs"
        >
          {expanded ? 'Cancelar' : 'Agregar Nota de Aclaración'}
        </button>
      </div>

      {addendums && addendums.length > 0 && (
        <ul className="mt-2 space-y-2">
          {addendums.map((item) => (
            <li
              key={item.id}
              className="rounded border border-amber-100 bg-white p-2 text-xs text-slate-700"
            >
              <div className="flex flex-wrap justify-between gap-1">
                <span className="font-semibold text-amber-900">Nota aclaratoria</span>
                <span className="text-slate-500">
                  {formatDate(item.signedAt)} — {item.authorName}
                </span>
              </div>
              <p className="mt-1">
                <span className="font-medium">Motivo:</span> {item.reason}
              </p>
              <p className="mt-1">{item.content}</p>
              <p className="mt-1 font-mono text-[10px] text-slate-400">
                SHA-256: {item.contentHash.slice(0, 24)}…
              </p>
            </li>
          ))}
        </ul>
      )}

      {expanded && (
        <form onSubmit={handlePrepareSign} className="mt-3 space-y-2 border-t border-amber-200 pt-3">
          <div>
            <label className="label-field">Motivo de la aclaratoria</label>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="input-field"
              placeholder="Ej. Corrección de anotación en procedimiento"
              required
            />
          </div>
          <div>
            <label className="label-field">Contenido de la aclaratoria</label>
            <textarea
              rows={3}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="input-field resize-y"
              required
            />
          </div>
          <DigitalSignatureCanvas onSignatureChange={setSignature} width={420} height={140} />
          {error && <p className="text-xs text-red-600">{error}</p>}
          {message && <p className="text-xs text-green-700">{message}</p>}
          <button type="submit" className="btn-secondary text-xs" disabled={busy}>
            Firmar nota aclaratoria
          </button>
        </form>
      )}

      <SignConfirmationModal
        open={showConfirm}
        title="Firmar nota aclaratoria de evolución"
        description="Confirme su identidad. Se creará un nuevo registro independiente sin modificar la evolución original."
        userEmail={user.email}
        onConfirm={handleConfirmSign}
        onCancel={() => setShowConfirm(false)}
      />
    </div>
  )
}
