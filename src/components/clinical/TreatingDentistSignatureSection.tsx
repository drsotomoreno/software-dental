import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { DigitalSignatureCanvas } from '@/components/signature/DigitalSignatureCanvas'
import { SignConfirmationModal } from '@/components/signature/SignConfirmationModal'
import { CLINICAL_SECTION_TITLE_CLASS } from '@/constants/clinicalHistorySections'
import { validateSignatureCapture } from '@/services/signatureService'
import type { SignatureCaptureResult } from '@/types/signature'
import { formatDate } from '@/utils'
import { getMainHistorySignatureStatus } from '@/utils/clinicalRecordSnapshot'

interface TreatingDentistSignatureSectionProps {
  patientId: string
  professionalName: string
  professionalDocument: string
  rethusNumber?: string
  userEmail?: string
  canSign?: boolean
  disabled?: boolean
  savedSignature?: SignatureCaptureResult | null
  onSaveProfileSignature?: (capture: SignatureCaptureResult) => Promise<void>
  onRegister?: (
    capture: SignatureCaptureResult,
    password: string,
  ) => Promise<{ ok: true } | { ok: false; error: string }>
}

export function TreatingDentistSignatureSection({
  patientId,
  professionalName,
  professionalDocument,
  rethusNumber = '',
  userEmail = '',
  canSign = false,
  disabled = false,
  savedSignature = null,
  onSaveProfileSignature,
  onRegister,
}: TreatingDentistSignatureSectionProps) {
  const status = useLiveQuery(
    () => (patientId ? getMainHistorySignatureStatus(patientId) : null),
    [patientId],
  )
  const [capture, setCapture] = useState<SignatureCaptureResult | null>(null)
  const [appliedFromProfile, setAppliedFromProfile] = useState(false)
  const [canvasKey, setCanvasKey] = useState(0)
  const [showConfirm, setShowConfirm] = useState(false)
  const [message, setMessage] = useState('')
  const [savingProfile, setSavingProfile] = useState(false)

  const signature = status?.signature
  const signed = status?.signed === true

  return (
    <section className="card space-y-4">
      <div>
        <h3 className={CLINICAL_SECTION_TITLE_CLASS}>
          Firma del Odontólogo Tratante (Res. 1995/1999)
        </h3>
        <p className="mt-3 text-sm text-slate-600">
          La firma de la historia clínica principal corresponde al profesional tratante. Es
          independiente del consentimiento informado y de las notas de evolución, y se registra una
          sola vez.
        </p>
      </div>

      {status === undefined ? (
        <p className="text-sm text-slate-500">Cargando estado de la firma…</p>
      ) : signed && signature ? (
        <div className="space-y-3">
          <dl className="grid gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Nombre completo
              </dt>
              <dd className="text-sm font-semibold text-slate-900">{signature.professionalName}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Cédula / ReTHUS
              </dt>
              <dd className="font-mono text-sm text-slate-900">
                {signature.professionalDocument}
                {signature.rethusNumber ? ` · ReTHUS ${signature.rethusNumber}` : ''}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Fecha y hora de cierre
              </dt>
              <dd className="text-sm text-slate-900">{formatDate(signature.signedAt)}</dd>
            </div>
          </dl>
          <img
            src={signature.signatureDataUrl}
            alt="Firma del odontólogo tratante"
            className="max-h-32 rounded-lg border border-slate-200 bg-white p-2"
          />
          <p className="text-sm font-medium text-green-800">
            Historia clínica principal firmada. Las evoluciones posteriores no reemplazan esta firma.
          </p>
        </div>
      ) : signed ? (
        <p className="text-sm font-medium text-green-800">
          Historia clínica principal firmada
          {status?.signedAt ? ` el ${formatDate(status.signedAt)}` : ''}. No se registra una segunda
          firma.
        </p>
      ) : (
        <div className="space-y-4">
          <dl className="grid gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Nombre completo
              </dt>
              <dd className="text-sm font-semibold text-slate-900">{professionalName || '—'}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Registro profesional / ReTHUS (cédula)
              </dt>
              <dd className="font-mono text-sm text-slate-900">
                {professionalDocument || '—'}
                {rethusNumber ? ` · ReTHUS ${rethusNumber}` : ''}
              </dd>
            </div>
          </dl>

          {appliedFromProfile && capture && (
            <div>
              <p className="mb-2 text-sm text-slate-600">Firma del perfil aplicada.</p>
              <img
                src={capture.dataUrl}
                alt="Firma guardada del perfil"
                className="max-h-32 rounded-lg border border-slate-200 bg-white p-2"
              />
            </div>
          )}

          <DigitalSignatureCanvas
            key={canvasKey}
            disabled={disabled || !canSign}
            onSignatureChange={(result) => {
              setAppliedFromProfile(false)
              setCapture(result)
              setMessage('')
            }}
          />

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-secondary"
              disabled={disabled || !canSign || !savedSignature}
              onClick={() => {
                if (!savedSignature) return
                setCapture(savedSignature)
                setAppliedFromProfile(true)
                setCanvasKey((value) => value + 1)
                setMessage('')
              }}
            >
              Aplicar firma guardada
            </button>
            <button
              type="button"
              className="btn-secondary"
              disabled={disabled || !canSign || !capture || !onSaveProfileSignature || savingProfile}
              onClick={() => {
                if (!capture || !onSaveProfileSignature) return
                const error = validateSignatureCapture(capture)
                if (error) {
                  setMessage(error)
                  return
                }
                setSavingProfile(true)
                void onSaveProfileSignature(capture)
                  .then(() => setMessage('Firma guardada en el perfil.'))
                  .catch((error: unknown) => {
                    setMessage(
                      error instanceof Error
                        ? error.message
                        : 'No se pudo guardar la firma en el perfil.',
                    )
                  })
                  .finally(() => setSavingProfile(false))
              }}
            >
              {savingProfile ? 'Guardando…' : 'Guardar en mi perfil'}
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={disabled || !canSign || !onRegister}
              onClick={() => {
                const error = validateSignatureCapture(capture)
                if (error) {
                  setMessage(error)
                  return
                }
                setMessage('')
                setShowConfirm(true)
              }}
            >
              Firmar y Registrar Historia Clínica
            </button>
          </div>

          {!canSign && (
            <p className="text-sm text-slate-500">
              Solo el odontólogo tratante con permiso de firma puede registrar la historia clínica.
            </p>
          )}
          {canSign && !savedSignature && (
            <p className="text-xs text-slate-500">
              No hay una firma guardada en el perfil. Dibuje la firma y use «Guardar en mi perfil»
              para reutilizarla.
            </p>
          )}
          {message && (
            <p
              className={`text-sm ${
                message.startsWith('Firma guardada') ? 'text-green-800' : 'text-red-600'
              }`}
            >
              {message}
            </p>
          )}
        </div>
      )}

      {onRegister && (
        <SignConfirmationModal
          open={showConfirm}
          title="Firmar y registrar historia clínica"
          description="Esta firma cierra la historia clínica principal a nombre del odontólogo tratante (Res. 1995/1999). No modifica el consentimiento informado ni las notas de evolución. Solo se registra una vez."
          userEmail={userEmail}
          onCancel={() => setShowConfirm(false)}
          onConfirm={async (password) => {
            if (!capture) return { ok: false as const, error: 'Debe firmar antes de registrar.' }
            const result = await onRegister(capture, password)
            if (!result.ok) return result
            setShowConfirm(false)
            setCapture(null)
            setAppliedFromProfile(false)
            return { ok: true as const }
          }}
        />
      )}
    </section>
  )
}
