import { useMemo } from 'react'
import { Eye, Printer } from 'lucide-react'
import type {
  OrthodonticsPaymentRecord,
  PaymentDocumentKind,
  PaymentInvoice,
  PaymentMethod,
  PaymentRecord,
} from '@/types/clinicalRecord'
import { PAYMENT_METHOD_LABELS } from '@/constants/dental'
import { formatCurrency } from '@/utils'
import {
  formatAbonoDate,
  paymentReceiptActionLabel,
  paymentReceiptTypeLabel,
  resolvePaymentDocumentKind,
} from '@/utils/paymentAbonos'
import { paymentInvoiceStatusLabel } from '@/components/invoices/CreditNoteModal'

export interface PatientPaymentDocumentEntry {
  key: string
  paymentDate: string
  amount: number
  paymentReason: string
  paymentMethod: PaymentMethod
  treatingDentistName?: string
  documentKind: PaymentDocumentKind | null
  invoice: PaymentInvoice
  source: 'control_pagos' | 'ortodoncia'
}

interface PatientPaymentDocumentsBoxProps {
  payments: PaymentRecord[]
  orthodonticsPayments?: OrthodonticsPaymentRecord[]
  onOpenDocument: (entry: PatientPaymentDocumentEntry) => void
}

function collectFromPayments(
  payments: Array<PaymentRecord | OrthodonticsPaymentRecord>,
  source: 'control_pagos' | 'ortodoncia',
): PatientPaymentDocumentEntry[] {
  const entries: PatientPaymentDocumentEntry[] = []

  for (const payment of payments) {
    for (const invoice of payment.invoices ?? []) {
      if (invoice.sharedCopy) continue
      if (!invoice.invoiceNumber?.trim() && !(invoice.amount > 0)) continue

      entries.push({
        key: `${source}:${payment.id}:${invoice.id}`,
        paymentDate: invoice.invoiceDate || payment.paymentDate,
        amount: invoice.amount || payment.amount || 0,
        paymentReason: payment.paymentReason,
        paymentMethod: payment.paymentMethod,
        treatingDentistName: payment.treatingDentistName,
        documentKind: resolvePaymentDocumentKind(payment),
        invoice,
        source,
      })
    }
  }

  return entries
}

function sortByDateDesc(entries: PatientPaymentDocumentEntry[]): PatientPaymentDocumentEntry[] {
  return [...entries].sort((a, b) => {
    const byDate = String(b.paymentDate).localeCompare(String(a.paymentDate))
    if (byDate !== 0) return byDate
    return b.key.localeCompare(a.key)
  })
}

export function PatientPaymentDocumentsBox({
  payments,
  orthodonticsPayments = [],
  onOpenDocument,
}: PatientPaymentDocumentsBoxProps) {
  const entries = useMemo(
    () =>
      sortByDateDesc([
        ...collectFromPayments(payments, 'control_pagos'),
        ...collectFromPayments(orthodonticsPayments, 'ortodoncia'),
      ]),
    [payments, orthodonticsPayments],
  )

  const totalAmount = entries.reduce((sum, entry) => sum + Math.max(0, Math.round(entry.amount || 0)), 0)

  return (
    <article className="mt-6 rounded-xl border border-dental-200 bg-white p-4 shadow-sm print:hidden">
      <header className="mb-4">
        <h3 className="text-xl font-bold text-dental-800">Comprobantes de Pagos del Paciente</h3>
        <h4 className="mt-1 text-sm font-semibold text-slate-900">
          Visualizar o imprimir todos los pagos
        </h4>
        <p className="mt-1 text-xs text-slate-500">
          Consulte el historial de recibos de caja internos y facturas electrónicas (FEV) emitidos por
          los pagos de este paciente. Al abrir un comprobante podrá visualizarlo e imprimirlo.
        </p>
      </header>

      {entries.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-center text-sm text-slate-500">
          Aún no hay recibos ni FEV registrados para este paciente.
        </p>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
            <span className="font-medium text-slate-700">
              {entries.length} comprobante{entries.length === 1 ? '' : 's'}
            </span>
            <span className="font-semibold tabular-nums text-slate-900">
              Total {formatCurrency(totalAmount)}
            </span>
          </div>

          <ul className="space-y-2">
            {entries.map((entry) => {
              const voidedLabel = paymentInvoiceStatusLabel(entry.invoice)
              const typeLabel = paymentReceiptTypeLabel(entry.documentKind)
              const sourceLabel =
                entry.source === 'ortodoncia' ? 'Ortodoncia' : 'Control de pagos'
              const numberLabel = entry.invoice.invoiceNumber?.trim() || 'Sin número'

              return (
                <li
                  key={entry.key}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-slate-800">
                      {formatAbonoDate(entry.paymentDate)}
                      <span className="ml-2 font-mono text-[11px] font-normal text-slate-500">
                        {numberLabel}
                      </span>
                    </p>
                    <p className="text-slate-500">
                      {typeLabel} · {sourceLabel} · {PAYMENT_METHOD_LABELS[entry.paymentMethod]}
                    </p>
                    <p className="truncate text-slate-600" title={entry.paymentReason}>
                      {entry.paymentReason || 'Pago'}
                    </p>
                    {voidedLabel ? <p className="text-rose-700">{voidedLabel}</p> : null}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold tabular-nums text-slate-900">
                      {formatCurrency(entry.amount)}
                    </p>
                    <button
                      type="button"
                      onClick={() => onOpenDocument(entry)}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-dental-200 bg-white px-2.5 text-[11px] font-semibold text-dental-800 hover:bg-dental-50"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      {paymentReceiptActionLabel(entry.documentKind)}
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenDocument(entry)}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                      title="Abre el comprobante para imprimirlo"
                    >
                      <Printer className="h-3.5 w-3.5" />
                      Imprimir
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </article>
  )
}
