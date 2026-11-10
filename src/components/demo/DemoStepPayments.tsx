import { useEffect, useMemo, useState } from 'react'
import { ExternalLink, FileText, Printer, Receipt, Wallet, X } from 'lucide-react'
import { formatCurrency } from '@/utils/crypto'
import { generateDianQrDataUrl } from '@/utils/thermalInvoicePrint'
import {
  buildDemoPaymentDocumentHtml,
  openDemoPaymentDocument,
  type DemoPaymentDocumentKind,
} from './buildDemoPaymentDocuments'
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
  const [previewKind, setPreviewKind] = useState<DemoPaymentDocumentKind | null>(null)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)

  const canGenerateDocuments = Boolean(formData.payment && formData.treatmentRow)

  useEffect(() => {
    if (previewKind !== 'fev' || !formData.payment || !formData.treatmentRow) {
      setQrDataUrl(null)
      return
    }
    let cancelled = false
    const seed = `MHD-DEMO-${formData.payment.amount}-${formData.treatmentRow.cupsCode}`
    // CUFE demo estable para el QR (solo visualización).
    const fakeCufe = Array.from(seed)
      .reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) >>> 0, 0)
      .toString(16)
      .padStart(8, '0')
      .repeat(12)
      .slice(0, 96)

    generateDianQrDataUrl(fakeCufe)
      .then((url) => {
        if (!cancelled) setQrDataUrl(url)
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl(null)
      })

    return () => {
      cancelled = true
    }
  }, [previewKind, formData.payment, formData.treatmentRow])

  const previewHtml = useMemo(() => {
    if (!previewKind || !formData.payment || !formData.treatmentRow) return ''
    return buildDemoPaymentDocumentHtml(formData, previewKind, {
      qrDataUrl: previewKind === 'fev' ? qrDataUrl : null,
    })
  }, [previewKind, formData, qrDataUrl])

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
    setDocMessage('Abono guardado. Ya puede visualizar el recibo o la factura electrónica.')
  }

  const handleGenerateDocument = (kind: DemoPaymentDocumentKind) => {
    if (!canGenerateDocuments) {
      setError('Guarde un abono (y un procedimiento en el Paso 5) para generar el documento.')
      setDocMessage('')
      return
    }
    setError('')
    setPreviewKind(kind)
    setDocMessage(
      kind === 'recibo_interno'
        ? 'Vista previa del recibo interno de caja.'
        : 'Vista previa de la Factura Electrónica de Venta (simulación).',
    )
  }

  const handleOpenTab = () => {
    if (!previewKind) return
    const result = openDemoPaymentDocument(formData, previewKind, {
      qrDataUrl: previewKind === 'fev' ? qrDataUrl : null,
    })
    if (!result.ok) {
      setError(result.error)
      return
    }
    setError('')
  }

  const handlePrintPreview = () => {
    const frame = document.getElementById('demo-payment-preview-frame') as HTMLIFrameElement | null
    frame?.contentWindow?.focus()
    frame?.contentWindow?.print()
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <p className="text-xs font-semibold uppercase tracking-wider text-dental-600">Paso 7 de 9</p>
      <h2 className="mt-1 text-2xl font-semibold text-slate-800">Facturación y Pagos</h2>
      <p className="mt-2 text-sm text-slate-500">
        mihistoriadental optimiza la administración de tu clínica mediante un doble flujo de
        facturación: emite recibos internos numerados para recaudos particulares diarios cuando no
        se requiere soporte fiscal o los ingresos brutos son inferiores a 3.500 UVT
        (~$187.900.000 COP), y genera Facturas Electrónicas de Venta en Salud (FEV) articuladas con
        RIPS JSON cuando el paciente lo exige, se opera como IPS o se superan los topes
        normativos 3.500 UVT (~$187.900.000 COP), garantizando un cumplimiento riguroso del Estatuto
        Tributario, la Resolución 000165 de 2023 de la DIAN y la Resolución 2275 de 2023 del
        Ministerio de Salud. Contamos con un semáforo que te avisa cuando se están superando los
        topes que te eximen de generar Factura Electrónica.
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
                setPreviewKind(null)
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
          Visualice un recibo de caja interno o una Factura Electrónica de Venta profesional con los
          datos del abono (membrete, CUPS, totales, firmas y CUFE simulado).
        </p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={() => handleGenerateDocument('recibo_interno')}
            disabled={!canGenerateDocuments}
            className="btn-secondary flex-1 gap-2 disabled:cursor-not-allowed"
          >
            <Receipt className="h-4 w-4" aria-hidden />
            Ver recibo interno de caja
          </button>
          <button
            type="button"
            onClick={() => handleGenerateDocument('fev')}
            disabled={!canGenerateDocuments}
            className="btn-primary flex-1 gap-2 disabled:cursor-not-allowed"
          >
            <FileText className="h-4 w-4" aria-hidden />
            Ver Factura Electrónica de Venta
          </button>
        </div>
        {docMessage ? <p className="text-sm text-dental-700">{docMessage}</p> : null}
        {!canGenerateDocuments ? (
          <p className="text-xs text-slate-500">
            Guarde un abono (y un procedimiento en el Paso 5) para habilitar estos botones.
          </p>
        ) : null}
      </div>

      {previewKind && previewHtml ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-3 sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-label={
            previewKind === 'recibo_interno'
              ? 'Vista previa del recibo interno'
              : 'Vista previa de la factura electrónica'
          }
        >
          <div className="flex h-full max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-slate-800">
                  {previewKind === 'recibo_interno'
                    ? 'Recibo de caja interno'
                    : 'Factura electrónica de venta (simulación)'}
                </p>
                <p className="text-xs text-slate-500">
                  Documento demostrativo con estándares de presentación comercial y normativa
                  colombiana.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={handlePrintPreview} className="btn-secondary gap-2">
                  <Printer className="h-4 w-4" aria-hidden />
                  Imprimir
                </button>
                <button type="button" onClick={handleOpenTab} className="btn-secondary gap-2">
                  <ExternalLink className="h-4 w-4" aria-hidden />
                  Abrir pestaña
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewKind(null)}
                  className="btn-primary gap-2"
                >
                  <X className="h-4 w-4" aria-hidden />
                  Cerrar
                </button>
              </div>
            </div>
            <iframe
              id="demo-payment-preview-frame"
              title="Vista previa del documento de pago"
              srcDoc={previewHtml}
              className="h-full min-h-0 w-full flex-1 bg-slate-100"
            />
          </div>
        </div>
      ) : null}
    </div>
  )
}
