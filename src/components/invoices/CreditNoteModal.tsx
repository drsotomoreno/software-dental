import { useState } from 'react'
import { X } from 'lucide-react'

export interface CreditNoteModalProps {
  open: boolean
  invoiceNumber: string
  amount?: number
  busy?: boolean
  onClose: () => void
  onSubmit: (reason: string) => void | Promise<void>
}

export function CreditNoteModal({
  open,
  invoiceNumber,
  amount,
  busy = false,
  onClose,
  onSubmit,
}: CreditNoteModalProps) {
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)

  if (!open) return null

  const handleSubmit = async () => {
    const trimmed = reason.trim()
    if (trimmed.length < 10) {
      setError('Indique el motivo de anulación o devolución (mínimo 10 caracteres).')
      return
    }
    setError(null)
    await onSubmit(trimmed)
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 p-4">
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold text-slate-900">Generar Nota Crédito</h3>
            <p className="mt-1 text-sm text-slate-600">
              Anulación formal de la factura{' '}
              <span className="font-mono font-semibold">{invoiceNumber}</span>
              {typeof amount === 'number'
                ? ` · ${amount.toLocaleString('es-CO', { style: 'currency', currency: 'COP' })}`
                : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Por normativa DIAN y Res. 2275 de 2023, la factura original permanecerá en el historial con
          estado &quot;Anulada por Nota Crédito&quot;. No se permite eliminar registros emitidos.
        </p>

        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">
            Motivo de anulación / devolución <span className="text-red-500">*</span>
          </span>
          <textarea
            rows={4}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Ej.: Devolución total por error en el valor facturado / anulación por duplicidad..."
            className="input-field resize-y text-sm"
            disabled={busy}
          />
        </label>

        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={() => void handleSubmit()}
            disabled={busy}
          >
            {busy ? 'Generando…' : 'Emitir Nota Crédito'}
          </button>
        </div>
      </div>
    </div>
  )
}

export function paymentInvoiceStatusLabel(invoice: {
  status?: string
  creditNoteNumber?: string
}): string | null {
  if (invoice.status === 'voided_by_credit_note' && invoice.creditNoteNumber) {
    return `Anulada por Nota Crédito #${invoice.creditNoteNumber}`
  }
  return null
}

export function electronicInvoiceStatusLabel(invoice: {
  status: string
  creditNoteNumber?: string | null
}): string {
  if (invoice.status === 'voided_by_credit_note' && invoice.creditNoteNumber) {
    return `Anulada por Nota Crédito #${invoice.creditNoteNumber}`
  }
  const labels: Record<string, string> = {
    draft: 'Borrador',
    validated: 'Validada',
    submitted: 'Enviada',
    cuv_approved: 'CUV aprobado',
    dian_sent: 'DIAN',
    accepted: 'Aceptada',
    rejected: 'Rechazada',
    cancelled: 'Cancelada',
    voided_by_credit_note: 'Anulada',
  }
  return labels[invoice.status] ?? invoice.status
}
