import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import type { Patient } from '@/types/patient'
import type { AuthUser } from '@/types/auth'
import { IHCE_OTP_LENGTH, IHCE_SIMULATED_OTP } from '@/types/ihce'
import {
  IhceInteropError,
  downloadRda,
  requestOtp,
  verifyOtp,
} from '@/services/ihceInteropService'
import { ExternalRdaPanel } from './ExternalRdaPanel'
import { Toast } from '@/components/ui/Toast'
import { useToast } from '@/hooks/useToast'

type ModalStep = 'confirm' | 'otp' | 'done'

interface DelegatedConsentModalProps {
  open: boolean
  onClose: () => void
  patient: Patient
  user?: Pick<AuthUser, 'id' | 'email' | 'firstName' | 'lastName' | 'role'> | null
}

export function DelegatedConsentModal({
  open,
  onClose,
  patient,
  user,
}: DelegatedConsentModalProps) {
  const [step, setStep] = useState<ModalStep>('confirm')
  const [pin, setPin] = useState('')
  const [consentId, setConsentId] = useState<string | null>(null)
  const [alertMessage, setAlertMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const { toastMessage, showToast, clearToast } = useToast(6000)

  useEffect(() => {
    if (!open) return
    setStep('confirm')
    setPin('')
    setConsentId(null)
    setAlertMessage(null)
    setError(null)
    setBusy(false)
  }, [open, patient.id])

  if (!open) return null

  const handleRequest = async () => {
    setError(null)
    setBusy(true)
    try {
      const result = await requestOtp(patient, user)
      setConsentId(result.consent.id)
      setAlertMessage(result.alertMessage)
      showToast(result.alertMessage)
      setStep('otp')
    } catch (err) {
      setError(err instanceof IhceInteropError ? err.message : 'No se pudo solicitar el código.')
    } finally {
      setBusy(false)
    }
  }

  const handleVerify = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!consentId) return
    setError(null)
    setBusy(true)
    try {
      await verifyOtp(consentId, pin, user)
      await downloadRda(consentId, user)
      setStep('done')
    } catch (err) {
      setError(
        err instanceof IhceInteropError
          ? err.message
          : 'No se pudo validar el código de autorización.',
      )
    } finally {
      setBusy(false)
    }
  }

  const pinReady = pin.replace(/\D/g, '').length === IHCE_OTP_LENGTH

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="ihce-rda-title"
        className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 id="ihce-rda-title" className="text-lg font-bold text-slate-900">
              Solicitar Historial Externo (RDA)
            </h3>
            <p className="mt-1 text-sm text-slate-600">
              Consentimiento delegado IHCE (Res. 1888 de 2025). Se enviará un código al celular
              registrado del paciente.
            </p>
          </div>
          <button
            type="button"
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
            onClick={onClose}
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {step === 'confirm' && (
          <div className="space-y-4">
            <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
              <p>
                <span className="font-medium">Paciente:</span> {patient.firstName} {patient.lastName}
              </p>
              <p>
                <span className="font-medium">Documento:</span> {patient.documentType}{' '}
                {patient.documentNumber}
              </p>
            </div>
            <p className="text-xs text-slate-500">
              Entorno de simulación Minsalud. El código de prueba es {IHCE_SIMULATED_OTP}.
            </p>
            {error && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
            )}
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>
                Cancelar
              </button>
              <button type="button" className="btn-primary" onClick={() => void handleRequest()} disabled={busy}>
                {busy ? 'Enviando…' : 'Enviar código'}
              </button>
            </div>
          </div>
        )}

        {step === 'otp' && (
          <form className="space-y-4" onSubmit={(event) => void handleVerify(event)}>
            {alertMessage && (
              <div
                role="alert"
                className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-950"
              >
                {alertMessage}
              </div>
            )}
            <div>
              <label htmlFor="ihce-otp-pin" className="label-field">
                Código de 6 dígitos
              </label>
              <input
                id="ihce-otp-pin"
                className="input-field mt-1 tracking-[0.4em] font-mono text-center text-lg"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={IHCE_OTP_LENGTH}
                pattern="[0-9]*"
                value={pin}
                onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, IHCE_OTP_LENGTH))}
                placeholder="••••••"
                disabled={busy}
              />
            </div>
            {error && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
            )}
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>
                Cerrar
              </button>
              <button type="submit" className="btn-primary" disabled={busy || !pinReady}>
                {busy ? 'Validando…' : 'Validar y descargar RDA'}
              </button>
            </div>
          </form>
        )}

        {step === 'done' && patient.id != null && (
          <div className="space-y-4">
            <p className="rounded-xl bg-green-50 px-4 py-3 text-sm text-green-800">
              RDA descargado y disponible offline en este equipo.
            </p>
            <ExternalRdaPanel patientId={patient.id} compact />
            <div className="flex justify-end">
              <button type="button" className="btn-primary" onClick={onClose}>
                Listo
              </button>
            </div>
          </div>
        )}
      </div>
      <Toast message={toastMessage} onDismiss={clearToast} />
    </div>
  )
}
