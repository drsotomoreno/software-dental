import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { db } from '@/db/database'
import { DigitalSignatureCanvas } from '@/components/signature/DigitalSignatureCanvas'
import { SignConfirmationModal } from '@/components/signature/SignConfirmationModal'
import { confirmUserPassword } from '@/services/authService'
import { createDigitalSignature, validateSignatureCapture } from '@/services/signatureService'
import { logAuditEvent } from '@/services/auditService'
import type { AuthUser } from '@/types/auth'
import type { ClinicalRecord } from '@/types/clinicalRecord'
import type { AddendumType } from '@/types/addendum'
import { ADDENDUM_TYPE_LABELS } from '@/types/addendum'
import type { SignatureCaptureResult } from '@/types/signature'
import { computeContentHash, formatDate, serializeForHash } from '@/utils'
import { CLINICAL_SECTION_TITLE_CLASS } from '@/constants/clinicalHistorySections'
import { collectSignatureContext } from '@/utils/clientContext'
import { getProfessionalSignBlocker } from '@/utils/professionalSignGate'

interface ClinicalRecordAddendumPanelProps {
  record: ClinicalRecord
  patientId: string
  user: AuthUser
}

export function ClinicalRecordAddendumPanel({
  record,
  patientId,
  user,
}: ClinicalRecordAddendumPanelProps) {
  const recordId = String(record.id ?? '')
  const addendums = useLiveQuery(
    () =>
      db.clinicalAddendums.where('parentRecordId').equals(recordId).sortBy('signedAt'),
    [recordId],
  )

  const [type, setType] = useState<AddendumType>('aclaratoria')
  const [reason, setReason] = useState('')
  const [content, setContent] = useState('')
  const [signature, setSignature] = useState<SignatureCaptureResult | null>(null)
  const [showConfirm, setShowConfirm] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const resetForm = () => {
    setReason('')
    setContent('')
    setSignature(null)
    setShowConfirm(false)
  }

  const handlePrepareSign = (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!reason.trim() || !content.trim()) {
      setError('Indique el motivo y el contenido de la nota.')
      return
    }
    const sigError = validateSignatureCapture(signature)
    if (sigError) {
      setError(sigError)
      return
    }
    if (!record.contentHash) {
      setError('El registro original no tiene hash de integridad.')
      return
    }
    const rethusBlocker = getProfessionalSignBlocker(user)
    if (rethusBlocker) {
      setError(rethusBlocker)
      return
    }
    setShowConfirm(true)
  }

  const handleConfirmSign = async (password: string) => {
    const valid = await confirmUserPassword(user.id, password)
    if (!valid) {
      return { ok: false as const, error: 'Contraseña incorrecta. Solo el usuario autenticado puede firmar.' }
    }

    if (!record.contentHash) {
      return { ok: false as const, error: 'El registro original no tiene hash de integridad.' }
    }

    setBusy(true)
    try {
      const context = await collectSignatureContext()
      const now = context.capturedAt
      const payload = {
        parentRecordId: recordId,
        patientId,
        type,
        reason: reason.trim(),
        content: content.trim(),
        authorUserId: user.id,
        authorEmail: user.email,
        authorName: `${user.firstName} ${user.lastName}`,
        authorDocument: user.documentNumber,
        sessionId: user.sessionId,
        parentRecordHash: record.contentHash,
        signedAt: now,
        createdAt: now,
      }
      const contentHash = await computeContentHash(serializeForHash(payload))

      const addendumId = await db.clinicalAddendums.add({
        ...payload,
        contentHash,
        deviceInfo: context.userAgent,
        ipAddress: context.ipAddress,
        timezone: context.timezone,
      })

      await createDigitalSignature({
        recordId: String(addendumId),
        recordType: 'addendum',
        capture: signature!,
        contentHash,
        user,
        signedByName: `${user.firstName} ${user.lastName}`,
        signedByDocument: user.documentNumber,
      })

      await logAuditEvent({
        action: 'SIGN_ADDENDUM',
        resourceType: 'clinical_record',
        resourceId: recordId,
        details: `${ADDENDUM_TYPE_LABELS[type]} — ${reason.trim().slice(0, 80)}`,
        user,
      })

      setMessage(`${ADDENDUM_TYPE_LABELS[type]} firmada y registrada. El registro original no fue modificado.`)
      resetForm()
      return { ok: true as const }
    } catch {
      return { ok: false as const, error: 'No se pudo registrar la nota aclaratoria.' }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card space-y-4 border-l-4 border-l-violet-500">
      <div>
        <h3 className={CLINICAL_SECTION_TITLE_CLASS}>
          Notas aclaratorias y adendas
        </h3>
        <p className="mt-1 text-sm text-slate-600">
          El registro firmado es inmutable. Cualquier corrección debe hacerse mediante una nota
          aclaratoria o adenda con firma y trazabilidad propias, sin sobrescribir el original.
        </p>
      </div>

      {addendums && addendums.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-slate-700">
            Documentos complementarios ({addendums.length})
          </p>
          <ul className="space-y-2">
            {addendums.map((item) => (
              <li
                key={String(item.id)}
                className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium text-slate-800">
                    {ADDENDUM_TYPE_LABELS[item.type]}
                  </span>
                  <span className="text-xs text-slate-500">
                    {formatDate(item.signedAt)} — {item.authorName}
                  </span>
                </div>
                <p className="mt-1 text-slate-600">
                  <span className="font-medium">Motivo:</span> {item.reason}
                </p>
                <p className="mt-1 text-slate-700">{item.content}</p>
                <p className="mt-2 font-mono text-xs text-slate-400">
                  Hash: {item.contentHash.slice(0, 24)}… · Usuario: {item.authorEmail}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}

      <form onSubmit={handlePrepareSign} className="space-y-3 border-t border-slate-200 pt-4">
        <p className="text-sm font-medium text-slate-700">Nueva nota complementaria</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label-field">Tipo</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as AddendumType)}
              className="input-field"
            >
              <option value="aclaratoria">Nota aclaratoria</option>
              <option value="adenda">Adenda</option>
            </select>
          </div>
          <div>
            <label className="label-field">Motivo</label>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="input-field"
              placeholder="Ej. Corrección de dato en evolución del 12/08/2026"
              required
            />
          </div>
        </div>
        <div>
          <label className="label-field">Contenido</label>
          <textarea
            rows={4}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="input-field resize-y"
            required
          />
        </div>
        <DigitalSignatureCanvas onSignatureChange={setSignature} />
        {error && <p className="text-sm text-red-600">{error}</p>}
        {message && <p className="text-sm text-green-700">{message}</p>}
        <button type="submit" className="btn-primary" disabled={busy}>
          Firmar {ADDENDUM_TYPE_LABELS[type].toLowerCase()}
        </button>
      </form>

      <SignConfirmationModal
        open={showConfirm}
        title={`Firmar ${ADDENDUM_TYPE_LABELS[type].toLowerCase()}`}
        description="Confirme su identidad para registrar esta nota complementaria. El documento original permanecerá intacto."
        userEmail={user.email}
        onConfirm={handleConfirmSign}
        onCancel={() => setShowConfirm(false)}
      />
    </div>
  )
}
