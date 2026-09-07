import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronDown, Search } from 'lucide-react'
import {
  RDA_OTP_LENGTH,
  RDA_OTP_RETRY_MS,
  formatRetryCountdown,
} from '@/constants/rdaExternalHistory'
import { CLINICAL_SECTION_TITLE_CLASS } from '@/constants/clinicalHistorySections'
import { useAuth } from '@/contexts/AuthContext'
import {
  getLatestRdaConsentForPatient,
  getLatestRdaHistoryForPatient,
  persistSimulatedRdaHistory,
  rdaPatientStorageKey,
  requestRdaOtp,
  validateRdaPin,
} from '@/services/rdaExternalHistoryService'
import type { Patient } from '@/types/patient'
import { formatDate } from '@/utils/crypto'

interface ExternalHistoryRdaPanelProps {
  patient: Patient
  canRequest?: boolean
  /** compact: solo el botón, para la cabecera de la ficha. */
  variant?: 'full' | 'compact'
}

export function ExternalHistoryRdaPanel({
  patient,
  canRequest = false,
  variant = 'full',
}: ExternalHistoryRdaPanelProps) {
  const { user } = useAuth()
  const [expanded, setExpanded] = useState(true)
  const [antecedentesOpen, setAntecedentesOpen] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [requesting, setRequesting] = useState(false)
  const [validating, setValidating] = useState(false)
  const [maskedPhone, setMaskedPhone] = useState('')
  const [pin, setPin] = useState('')
  const [panelError, setPanelError] = useState('')
  const [pinError, setPinError] = useState('')
  const [otpNotice, setOtpNotice] = useState('')
  const [retryUntil, setRetryUntil] = useState(0)
  const [now, setNow] = useState(() => Date.now())

  const storageKey = rdaPatientStorageKey(patient)

  const history = useLiveQuery(async () => {
    if (!storageKey) return undefined
    return getLatestRdaHistoryForPatient(storageKey)
  }, [storageKey])

  const consent = useLiveQuery(async () => {
    if (!storageKey) return undefined
    return getLatestRdaConsentForPatient(storageKey)
  }, [storageKey])

  useEffect(() => {
    if (history) setAntecedentesOpen(true)
  }, [history])

  useEffect(() => {
    if (!modalOpen || retryUntil <= Date.now()) return undefined
    const timer = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(timer)
  }, [modalOpen, retryUntil])

  const retryRemainingMs = Math.max(0, retryUntil - now)
  const canResend = retryRemainingMs === 0 && !requesting

  async function sendOtp(): Promise<boolean> {
    setPanelError('')
    setPinError('')
    setRequesting(true)
    try {
      const result = await requestRdaOtp(patient, user)
      if (!result.ok) {
        setPanelError(result.error)
        return false
      }
      setMaskedPhone(result.maskedPhone)
      setOtpNotice(`Código enviado al celular del paciente (${result.maskedPhone}).`)
      setRetryUntil(Date.now() + RDA_OTP_RETRY_MS)
      setNow(Date.now())
      setPin('')
      return true
    } finally {
      setRequesting(false)
    }
  }

  async function handleRequestClick() {
    if (!canRequest) {
      setPanelError('No tiene permiso para solicitar el historial externo.')
      return
    }
    const sent = await sendOtp()
    if (sent) setModalOpen(true)
  }

  async function handleResend() {
    if (!canResend) return
    await sendOtp()
  }

  async function handleValidatePin() {
    setPinError('')
    const check = validateRdaPin(pin)
    if (!check.ok) {
      setPinError(check.error)
      return
    }
    setValidating(true)
    try {
      await persistSimulatedRdaHistory({
        patient,
        maskedPhone,
        user,
      })
      setModalOpen(false)
      setPin('')
      setOtpNotice('')
      setExpanded(true)
      setAntecedentesOpen(true)
    } catch (error) {
      setPinError(
        error instanceof Error
          ? error.message
          : 'No fue posible guardar el RDA en el expediente local.',
      )
    } finally {
      setValidating(false)
    }
  }

  const requestButton = (
    <button
      type="button"
      className="btn-primary shrink-0"
      onClick={() => void handleRequestClick()}
      disabled={!canRequest || requesting}
      title={
        canRequest
          ? 'Solicitar historial clínico externo (RDA)'
          : 'Requiere permiso para actualizar datos del paciente'
      }
    >
      <Search className="mr-2 h-4 w-4" aria-hidden />
      {requesting ? 'Solicitando…' : 'Solicitar Historial Externo (RDA)'}
    </button>
  )

  const otpModal = modalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div
            className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby={`rda-otp-title-${variant}`}
          >
            <h3 id={`rda-otp-title-${variant}`} className="text-lg font-semibold text-slate-900">
              Validación OTP Minsalud
            </h3>
            <div
              className="mt-3 rounded-lg border border-teal-200 bg-teal-50 p-3 text-sm text-teal-900"
              role="status"
            >
              Código enviado al celular del paciente ({maskedPhone}).
            </div>
            <p className="mt-3 text-sm text-slate-600">
              Ingrese el PIN de 6 dígitos para autorizar la descarga del Resumen Digital de Atención.
            </p>

            <label className="label-field mt-4" htmlFor={`rda-otp-pin-${variant}`}>
              Código de 6 dígitos
            </label>
            <input
              id={`rda-otp-pin-${variant}`}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={RDA_OTP_LENGTH}
              value={pin}
              onChange={(event) => {
                setPin(event.target.value.replace(/\D/g, '').slice(0, RDA_OTP_LENGTH))
                setPinError('')
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  void handleValidatePin()
                }
              }}
              className="input-field tracking-[0.4em] text-center text-lg font-semibold"
              placeholder="------"
              autoFocus
            />

            {pinError && (
              <p className="mt-2 text-sm text-red-600" role="alert">
                {pinError}
              </p>
            )}

            <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                className="btn-secondary text-sm"
                onClick={() => void handleResend()}
                disabled={!canResend}
              >
                {canResend
                  ? 'Reenviar código'
                  : `Reintentar en ${formatRetryCountdown(retryRemainingMs)}`}
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    setModalOpen(false)
                    setPin('')
                    setPinError('')
                  }}
                  disabled={validating}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => void handleValidatePin()}
                  disabled={validating || pin.length !== RDA_OTP_LENGTH}
                >
                  {validating ? 'Validando…' : 'Validar Código'}
                </button>
              </div>
            </div>
          </div>
        </div>
  ) : null

  if (variant === 'compact') {
    return (
      <div className="flex flex-wrap items-center gap-2" data-testid="external-history-rda-button">
        {requestButton}
        {panelError && (
          <span className="text-sm text-red-700" role="alert">
            {panelError}
          </span>
        )}
        {otpModal}
      </div>
    )
  }

  return (
    <section className="card border-dental-200 bg-white" data-testid="external-history-rda-panel">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="flex min-w-0 flex-1 items-center justify-between gap-2 text-left"
          aria-expanded={expanded}
        >
          <div>
            <h3 className={CLINICAL_SECTION_TITLE_CLASS}>Solicitar Historial Externo (RDA)</h3>
            <p className="mt-0.5 text-xs text-slate-500">
              Consulta interoperable al Minsalud. El OTP se envía al teléfono de contacto del
              paciente.
            </p>
          </div>
          <ChevronDown
            className={`h-4 w-4 shrink-0 text-slate-400 transition ${expanded ? 'rotate-180' : ''}`}
            aria-hidden
          />
        </button>
        {requestButton}
      </div>

      {panelError && (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
          {panelError}
        </div>
      )}

      {otpNotice && !modalOpen && (
        <div
          className="mt-3 rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-sm text-teal-900"
          role="status"
        >
          {otpNotice}
        </div>
      )}

      {expanded && (
        <div className="mt-4 space-y-3">
          {history ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50">
              <button
                type="button"
                onClick={() => setAntecedentesOpen((value) => !value)}
                className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left"
                aria-expanded={antecedentesOpen}
              >
                <div>
                  <p className="text-sm font-semibold text-dental-700">
                    Antecedentes Interoperados (RDA)
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Recibido {formatDate(history.receivedAt)}
                    {history.prestadorOrigen ? ` · ${history.prestadorOrigen}` : ''}
                  </p>
                </div>
                <ChevronDown
                  className={`h-4 w-4 shrink-0 text-slate-400 transition ${antecedentesOpen ? 'rotate-180' : ''}`}
                  aria-hidden
                />
              </button>
              {antecedentesOpen && (
                <div className="space-y-3 border-t border-slate-200 px-3 py-3">
                  {consent && (
                    <p className="text-[11px] text-slate-500">
                      Consentimiento criptográfico {consent.algorithm}:{' '}
                      <span className="font-mono text-slate-700">{consent.contentHash.slice(0, 16)}…</span>
                    </p>
                  )}
                  <div>
                    <p className="text-xs font-semibold uppercase text-slate-500">Diagnósticos CIE-10</p>
                    <ul className="mt-1 space-y-1">
                      {history.diagnoses.map((diagnosis) => (
                        <li key={diagnosis.code} className="text-sm text-slate-800">
                          <span className="font-semibold">{diagnosis.code}</span> — {diagnosis.description}
                          <span className="ml-1 text-xs text-slate-500">
                            ({diagnosis.type}, {diagnosis.certainty})
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase text-slate-500">Procedimientos CUPS</p>
                    <ul className="mt-1 space-y-1">
                      {history.procedures.map((procedure) => (
                        <li key={procedure.cupsCode} className="text-sm text-slate-800">
                          <span className="font-semibold">{procedure.cupsCode}</span> — {procedure.description}
                          {procedure.performedAt ? (
                            <span className="ml-1 text-xs text-slate-500">({procedure.performedAt})</span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs text-slate-500">
              Aún no hay un RDA externo guardado para este paciente. Tras validar el OTP, los
              diagnósticos y procedimientos quedarán disponibles sin conexión.
            </p>
          )}
        </div>
      )}

      {otpModal}
    </section>
  )
}
