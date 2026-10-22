import { useEffect, useId, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import type { PaymentDocumentKind } from '@/types/clinicalRecord'
import { formatCurrency } from '@/utils'
import { abonoFitsBalance, parseAbonoAmount, remainingAfterAbono } from '@/utils/paymentAbonos'

export interface PaymentRegistrationInput {
  amount: number
  documentKind: PaymentDocumentKind
  paymentDate: string
  /** Nº de control cuando el abono nace de la tarjeta de controles. */
  controlNumber?: number
}

export interface PaymentControlOption {
  value: number
  label: string
}

interface PaymentRegistrationModalProps {
  open: boolean
  sessionKey: string
  procedureTitle: string
  remaining: number
  treatmentBalance: number
  busy?: boolean
  notice?: string | null
  /** Concepto fijado por la tarjeta que abrió el formulario. */
  conceptLabel?: string
  controlOptions?: PaymentControlOption[]
  defaultControlNumber?: number
  onClose: () => void
  onSubmit: (input: PaymentRegistrationInput) => void
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

export function PaymentRegistrationModal({
  open,
  sessionKey,
  procedureTitle,
  remaining,
  treatmentBalance,
  busy = false,
  notice = null,
  conceptLabel,
  controlOptions,
  defaultControlNumber,
  onClose,
  onSubmit,
}: PaymentRegistrationModalProps) {
  const titleId = useId()
  const [draft, setDraft] = useState('')
  const [documentKind, setDocumentKind] = useState<PaymentDocumentKind>('recibo_interno')
  const [paymentDate, setPaymentDate] = useState(todayIso)
  const [controlNumber, setControlNumber] = useState<number | ''>('')
  const [error, setError] = useState<string | null>(null)
  const asksControlNumber = Boolean(controlOptions && controlOptions.length > 0)
  const initialControlNumber = defaultControlNumber ?? controlOptions?.[0]?.value ?? ''

  useEffect(() => {
    if (!open) return
    setDraft('')
    setDocumentKind('recibo_interno')
    setPaymentDate(todayIso())
    setControlNumber(initialControlNumber)
    setError(null)
  }, [open, sessionKey, initialControlNumber])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, busy, onClose])

  if (!open) return null

  const amount = parseAbonoAmount(draft)
  const amountReady = abonoFitsBalance(amount, remaining)
  const procedureAfter = amountReady ? remainingAfterAbono(remaining, amount) : remaining
  const treatmentAfter = amountReady
    ? Math.max(0, Math.round(treatmentBalance) - amount)
    : treatmentBalance

  const handleSubmit = () => {
    if (busy) return
    if (amount <= 0) {
      setError('Escriba el valor que el paciente abona en esta atención.')
      return
    }
    if (amount > remaining) {
      setError(`El abono supera el saldo pendiente (${formatCurrency(remaining)}).`)
      return
    }
    if (!paymentDate) {
      setError('Indique la fecha del abono.')
      return
    }
    if (asksControlNumber && typeof controlNumber !== 'number') {
      setError('Seleccione el número de control que cubre este abono.')
      return
    }
    setError(null)
    onSubmit({
      amount,
      documentKind,
      paymentDate,
      ...(asksControlNumber && typeof controlNumber === 'number' ? { controlNumber } : {}),
    })
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto bg-slate-900/50 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="my-auto w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 id={titleId} className="text-lg font-bold text-slate-900">
              Registrar Pago
            </h3>
            <p className="mt-1 text-sm text-slate-600">{procedureTitle}</p>
            {conceptLabel ? (
              <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-dental-700">
                Concepto: {conceptLabel}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-50"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          Saldo pendiente del procedimiento:{' '}
          <span className="font-semibold tabular-nums">{formatCurrency(remaining)}</span>
        </p>

        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault()
            handleSubmit()
          }}
        >
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">Valor del abono</span>
            <input
              autoFocus
              inputMode="numeric"
              disabled={busy}
              aria-label="Valor del abono"
              placeholder="Escriba el valor abonado"
              className="input-field text-right tabular-nums"
              value={draft}
              onChange={(event) => {
                setDraft(event.target.value.replace(/[^\d]/g, ''))
                setError(null)
              }}
            />
            <span className="mt-1 block text-xs text-slate-500">
              Escriba el valor que el paciente abona en esta atención.
              {amount > 0 ? ` ${formatCurrency(amount)}.` : ''}
            </span>
          </label>

          {conceptLabel ? (
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-700">Concepto</span>
              <input
                readOnly
                aria-label="Concepto del abono"
                className="input-field bg-dental-50 font-medium text-dental-900"
                value={conceptLabel}
              />
            </label>
          ) : null}

          {asksControlNumber ? (
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-700">Nº de control</span>
              <select
                disabled={busy}
                aria-label="Número de control"
                className="input-field text-sm"
                value={controlNumber}
                onChange={(event) => setControlNumber(Number(event.target.value))}
              >
                {controlOptions?.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">Fecha</span>
            <input
              type="date"
              disabled={busy}
              className="input-field"
              value={paymentDate}
              onChange={(event) => setPaymentDate(event.target.value)}
            />
          </label>

          <fieldset disabled={busy}>
            <legend className="mb-2 text-sm font-medium text-slate-700">Tipo de comprobante</legend>
            <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Tipo de comprobante">
              <button
                type="button"
                role="radio"
                aria-checked={documentKind === 'recibo_interno'}
                onClick={() => setDocumentKind('recibo_interno')}
                className={`rounded-xl border px-3 py-3 text-left text-sm transition ${
                  documentKind === 'recibo_interno'
                    ? 'border-dental-600 bg-dental-50 ring-2 ring-dental-200'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <span className="block font-semibold text-slate-900">Recibo Interno</span>
                <span className="mt-0.5 block text-xs text-slate-500">Comprobante de caja, sin folio DIAN</span>
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={documentKind === 'factura'}
                onClick={() => setDocumentKind('factura')}
                className={`rounded-xl border px-3 py-3 text-left text-sm transition ${
                  documentKind === 'factura'
                    ? 'border-dental-600 bg-dental-50 ring-2 ring-dental-200'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <span className="block font-semibold text-slate-900">Factura</span>
                <span className="mt-0.5 block text-xs text-slate-500">Factura Electrónica / DIAN</span>
              </button>
            </div>
          </fieldset>

          <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 sm:grid-cols-2">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Saldo del procedimiento
              </p>
              <p className="text-sm font-semibold tabular-nums text-slate-900">
                {formatCurrency(procedureAfter)}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Saldo del tratamiento
              </p>
              <p className="text-sm font-semibold tabular-nums text-amber-800">
                {formatCurrency(treatmentAfter)}
              </p>
            </div>
          </div>

          {error && (
            <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
              {error}
            </p>
          )}
          {notice && !error && (
            <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
              {notice}
            </p>
          )}

          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" onClick={onClose} disabled={busy} className="btn-secondary">
              Cancelar
            </button>
            <button type="submit" disabled={busy || !amountReady} className="btn-primary">
              {busy ? 'Registrando…' : 'Registrar Pago'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  )
}
