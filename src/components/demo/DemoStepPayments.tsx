import { useState } from 'react'
import { FileText, Receipt, Wallet } from 'lucide-react'
import { formatCurrency } from '@/utils/crypto'
import { openDemoPaymentDocument } from './buildDemoPaymentDocuments'
import {
  demoBudgetBalance,
  demoTreatmentTotal,
  type DemoFormData,
  type DemoPayment,
} from './demoTypes'

interface DemoStepPaymentsProps {
  formData: DemoFormData
  onChange: (payment: DemoPayment | null) => void
}

const PAYMENT_METHODS = ['Efectivo', 'Transferencia', 'Tarjeta', 'PSE'] as const

/** Paso 7 — Registro de un abono al presupuesto del Paso 5. */
export function DemoStepPayments({ formData, onChange }: DemoStepPaymentsProps) {
  const budget = formData.treatmentRow
  const balance = demoBudgetBalance(formData)
  const [amount, setAmount] = useState(
    formData.payment ? String(formData.payment.amount) : '',
  )
  const [method, setMethod] = useState(formData.payment?.method ?? PAYMENT_METHODS[0])
  const [note, setNote] = useState(formData.payment?.note ?? '')
  const [error, setError] = useState('')
  const [docMessage, setDocMessage] = useState('')

  const canGenerateDocuments = Boolean(formData.payment && formData.treatmentRow)

  const handleRegister = () => {
    if (!budget) {
      setError('Primero agregue un procedimiento en el Paso 5 para generar el presupuesto.')
      return
    }
    const value = Number(amount.replace(/,/g, '.'))
    if (!Number.isFinite(value) || value <= 0) {
      setError('Ingrese un valor de abono válido mayor a cero.')
      return
    }
    if (value > balance.total) {
      setError('El abono no puede superar el total del presupuesto en esta demo.')
      return
    }
    onChange({ amount: value, method, note: note.trim() })
    setError('')
    setDocMessage('Abono guardado. Ya puede generar el recibo o la factura electrónica.')
  }

  const handleGenerateDocument = (kind: 'recibo_interno' | 'fev') => {
    const result = openDemoPaymentDocument(formData, kind)
    if (!result.ok) {
      setError(result.error)
      setDocMessage('')
      return
    }
    setError('')
    setDocMessage(
      kind === 'recibo_interno'
        ? 'Recibo interno de caja generado en una nueva ventana.'
        : 'Factura Electrónica de Venta (simulación) generada en una nueva ventana.',
    )
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <p className="text-xs font-semibold uppercase tracking-wider text-dental-600">Paso 7 de 9</p>
      <h2 className="mt-1 text-2xl font-semibold text-slate-800">Pagos</h2>
      <p className="mt-2 text-sm text-slate-500">
        Registre un abono al presupuesto creado en el Paso 5 y genere el documento de soporte.
      </p>

      <div className="mt-6 grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Presupuesto</p>
          <p className="mt-1 text-lg font-semibold text-slate-800">
            {budget ? formatCurrency(demoTreatmentTotal(budget)) : '—'}
          </p>
          {budget ? (
            <p className="mt-0.5 truncate text-xs text-slate-500">{budget.procedureName}</p>
          ) : (
            <p className="mt-0.5 text-xs text-amber-700">Sin procedimiento en el Paso 5</p>
          )}
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Abonado</p>
          <p className="mt-1 text-lg font-semibold text-dental-700">
            {formatCurrency(balance.paid)}
          </p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Saldo</p>
          <p className="mt-1 text-lg font-semibold text-slate-800">
            {formatCurrency(balance.remaining)}
          </p>
        </div>
      </div>

      <div className="mt-6 space-y-4 rounded-xl border border-slate-200 p-4 sm:p-5">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
          <Wallet className="h-4 w-4 text-dental-600" aria-hidden />
          Registrar abono
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="demo-payment-amount" className="mb-1 block text-sm font-medium text-slate-700">
              Valor del abono (COP)
            </label>
            <input
              id="demo-payment-amount"
              type="number"
              min={0}
              step={1000}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
              className="input-field"
            />
          </div>
          <div>
            <label htmlFor="demo-payment-method" className="mb-1 block text-sm font-medium text-slate-700">
              Medio de pago
            </label>
            <select
              id="demo-payment-method"
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              className="input-field"
            >
              {PAYMENT_METHODS.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="demo-payment-note" className="mb-1 block text-sm font-medium text-slate-700">
              Observación (opcional)
            </label>
            <input
              id="demo-payment-note"
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Ej. Abono inicial en recepción"
              className="input-field"
            />
          </div>
        </div>

        {error ? (
          <p role="alert" className="text-sm text-amber-800">
            {error}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={handleRegister} className="btn-primary">
            Guardar abono
          </button>
          {formData.payment ? (
            <button
              type="button"
              onClick={() => {
                onChange(null)
                setAmount('')
                setNote('')
                setError('')
                setDocMessage('')
              }}
              className="btn-secondary"
            >
              Quitar abono
            </button>
          ) : null}
        </div>
      </div>

      <div className="mt-6 space-y-3 rounded-xl border border-slate-200 p-4 sm:p-5">
        <p className="text-sm font-semibold text-slate-700">Documentos de soporte</p>
        <p className="text-sm text-slate-500">
          Genere el recibo interno de caja o una simulación de Factura Electrónica de Venta con los
          datos del abono.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={() => handleGenerateDocument('recibo_interno')}
            disabled={!canGenerateDocuments}
            className="btn-secondary flex-1 gap-2 disabled:cursor-not-allowed"
          >
            <Receipt className="h-4 w-4" aria-hidden />
            Generar recibo interno de caja
          </button>
          <button
            type="button"
            onClick={() => handleGenerateDocument('fev')}
            disabled={!canGenerateDocuments}
            className="btn-primary flex-1 gap-2 disabled:cursor-not-allowed"
          >
            <FileText className="h-4 w-4" aria-hidden />
            Generar Factura Electrónica de Venta
          </button>
        </div>
        {docMessage ? <p className="text-sm text-dental-700">{docMessage}</p> : null}
        {!canGenerateDocuments ? (
          <p className="text-xs text-slate-500">
            Guarde un abono (y un procedimiento en el Paso 5) para habilitar estos botones.
          </p>
        ) : null}
      </div>
    </div>
  )
}
