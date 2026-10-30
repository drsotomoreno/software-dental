import { useEffect, useId, useMemo, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { Eye, Link2, NotebookPen, Printer, X } from 'lucide-react'
import type {
  OrthodonticsPaymentRecord,
  PaymentControlLine,
  PaymentDocumentKind,
  PaymentInvoice,
  PaymentMethod,
  PaymentRecord,
} from '@/types/clinicalRecord'
import { PAYMENT_METHOD_LABELS } from '@/constants/dental'
import { formatCurrency } from '@/utils'
import {
  formatAbonoDate,
  paymentHasProcedureLink,
  paymentReceiptActionLabel,
  paymentReceiptTypeLabel,
  resolvePaymentDocumentKind,
} from '@/utils/paymentAbonos'
import { paymentInvoiceStatusLabel } from '@/components/invoices/CreditNoteModal'
import { lineRemainingBalance } from '@/utils/paymentControlLines'

export interface PatientPaymentDocumentEntry {
  key: string
  paymentId: string
  paymentDate: string
  amount: number
  paymentReason: string
  paymentMethod: PaymentMethod
  treatingDentistName?: string
  documentKind: PaymentDocumentKind | null
  invoice: PaymentInvoice
  source: 'control_pagos' | 'ortodoncia'
  hasProcedureLink: boolean
  notes?: string
  linkedProcedureName?: string
}

export interface PaymentProcedureOption {
  id: string
  label: string
  remaining: number
}

interface PatientPaymentDocumentsBoxProps {
  payments: PaymentRecord[]
  orthodonticsPayments?: OrthodonticsPaymentRecord[]
  paymentControlLines?: PaymentControlLine[]
  disabled?: boolean
  onOpenDocument: (entry: PatientPaymentDocumentEntry) => void
  onAssociatePayment?: (paymentId: string, lineId: string) => void
  onSavePaymentNote?: (paymentId: string, note: string) => void
}

type ClarifyAction =
  | { kind: 'associate'; entry: PatientPaymentDocumentEntry }
  | { kind: 'note'; entry: PatientPaymentDocumentEntry }

function procedureLabel(line: PaymentControlLine): string {
  const name = line.procedure.trim() || 'Procedimiento sin nombre'
  const cups = line.cupsCode?.trim()
  return cups ? `${name} (${cups})` : name
}

function linkedProcedureLabel(
  payment: PaymentRecord,
  lineById: Map<string, PaymentControlLine>,
): string | undefined {
  const allocations = (payment.lineAllocations ?? []).filter((item) => item.amount > 0)
  if (allocations.length > 0) {
    const names = allocations.map((item) => {
      const line = lineById.get(item.lineId)
      if (line) return procedureLabel(line)
      const fallback = item.description?.trim()
      return fallback || 'Procedimiento'
    })
    return [...new Set(names)].join(' · ')
  }

  const linkedLineId = payment.paymentControlLineId
  if (!linkedLineId) return undefined
  const linkedLine = lineById.get(linkedLineId)
  return linkedLine ? procedureLabel(linkedLine) : undefined
}

function collectFromPayments(
  payments: PaymentRecord[],
  source: 'control_pagos',
  lines: PaymentControlLine[],
): PatientPaymentDocumentEntry[]
function collectFromPayments(
  payments: OrthodonticsPaymentRecord[],
  source: 'ortodoncia',
  lines: PaymentControlLine[],
): PatientPaymentDocumentEntry[]
function collectFromPayments(
  payments: Array<PaymentRecord | OrthodonticsPaymentRecord>,
  source: 'control_pagos' | 'ortodoncia',
  lines: PaymentControlLine[],
): PatientPaymentDocumentEntry[] {
  const entries: PatientPaymentDocumentEntry[] = []
  const knownLineIds = new Set(lines.map((line) => line.id))
  const lineById = new Map(lines.map((line) => [line.id, line]))

  for (const payment of payments) {
    const hasProcedureLink =
      source === 'control_pagos'
        ? paymentHasProcedureLink(payment as PaymentRecord, knownLineIds)
        : true
    const linkedProcedureName =
      source === 'control_pagos'
        ? linkedProcedureLabel(payment as PaymentRecord, lineById)
        : payment.paymentReason?.trim() || undefined

    for (const invoice of payment.invoices ?? []) {
      if (invoice.sharedCopy) continue
      if (!invoice.invoiceNumber?.trim() && !(invoice.amount > 0)) continue

      entries.push({
        key: `${source}:${payment.id}:${invoice.id}`,
        paymentId: payment.id,
        paymentDate: invoice.invoiceDate || payment.paymentDate,
        amount: invoice.amount || payment.amount || 0,
        paymentReason: payment.paymentReason,
        paymentMethod: payment.paymentMethod,
        treatingDentistName:
          source === 'control_pagos'
            ? (payment as PaymentRecord).treatingDentistName
            : undefined,
        documentKind: resolvePaymentDocumentKind(payment),
        invoice,
        source,
        hasProcedureLink,
        notes: payment.notes,
        linkedProcedureName,
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

function ClarifyPaymentDialog({
  action,
  procedureOptions,
  onClose,
  onAssociate,
  onSaveNote,
}: {
  action: ClarifyAction
  procedureOptions: PaymentProcedureOption[]
  onClose: () => void
  onAssociate: (paymentId: string, lineId: string) => void
  onSaveNote: (paymentId: string, note: string) => void
}) {
  const titleId = useId()
  const [lineId, setLineId] = useState(procedureOptions[0]?.id ?? '')
  const [note, setNote] = useState(action.entry.notes ?? '')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLineId(procedureOptions[0]?.id ?? '')
    setNote(action.entry.notes ?? '')
    setError(null)
  }, [action, procedureOptions])

  const title =
    action.kind === 'associate'
      ? 'Asociar pago a un procedimiento'
      : 'Descripción del comprobante'
  const description =
    action.kind === 'associate'
      ? 'Elija un procedimiento del plan de pagos (importado del presupuesto, sección 8) al que corresponde este recibo o factura.'
      : 'Si el pago no corresponde a un procedimiento del plan, escriba una descripción libre del concepto.'

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (action.kind === 'associate') {
      if (!lineId) {
        setError('Seleccione un procedimiento.')
        return
      }
      onAssociate(action.entry.paymentId, lineId)
      onClose()
      return
    }
    const trimmed = note.trim()
    if (!trimmed) {
      setError('Escriba la descripción del comprobante.')
      return
    }
    onSaveNote(action.entry.paymentId, trimmed)
    onClose()
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto bg-slate-900/50 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h3 id={titleId} className="text-lg font-semibold text-slate-900">
              {title}
            </h3>
            <p className="mt-1 text-sm text-slate-600">{description}</p>
            <p className="mt-2 text-xs text-slate-500">
              {formatAbonoDate(action.entry.paymentDate)} · {formatCurrency(action.entry.amount)}
              {action.entry.paymentReason ? ` · ${action.entry.paymentReason}` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {action.kind === 'associate' ? (
            procedureOptions.length === 0 ? (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                No hay procedimientos en el plan de pagos. Importe el presupuesto (sección 8) o
                agregue un procedimiento antes de asociar este comprobante.
              </p>
            ) : (
              <label className="block space-y-1.5 text-sm">
                <span className="font-medium text-slate-700">Procedimiento</span>
                <select
                  value={lineId}
                  onChange={(event) => setLineId(event.target.value)}
                  className="input-field"
                  autoFocus
                >
                  {procedureOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                      {option.remaining > 0
                        ? ` · saldo ${formatCurrency(option.remaining)}`
                        : ' · sin saldo'}
                    </option>
                  ))}
                </select>
              </label>
            )
          ) : (
            <label className="block space-y-1.5 text-sm">
              <span className="font-medium text-slate-700">Descripción</span>
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                rows={4}
                className="input-field resize-y"
                placeholder="Ej. Anticipo, abono a cuenta, pago parcial de tratamiento integral…"
                autoFocus
              />
            </label>
          )}

          {error ? <p className="text-sm text-rose-700">{error}</p> : null}

          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={action.kind === 'associate' && procedureOptions.length === 0}
              className="btn-primary flex-1 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {action.kind === 'associate' ? 'Asociar' : 'Guardar descripción'}
            </button>
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  )
}

export function PatientPaymentDocumentsBox({
  payments,
  orthodonticsPayments = [],
  paymentControlLines = [],
  disabled = false,
  onOpenDocument,
  onAssociatePayment,
  onSavePaymentNote,
}: PatientPaymentDocumentsBoxProps) {
  const [clarifyAction, setClarifyAction] = useState<ClarifyAction | null>(null)

  const entries = useMemo(
    () =>
      sortByDateDesc([
        ...collectFromPayments(payments, 'control_pagos', paymentControlLines),
        ...collectFromPayments(orthodonticsPayments, 'ortodoncia', paymentControlLines),
      ]),
    [payments, orthodonticsPayments, paymentControlLines],
  )

  const procedureOptions = useMemo<PaymentProcedureOption[]>(
    () =>
      paymentControlLines
        .filter((line) => line.procedure.trim())
        .map((line) => ({
          id: line.id,
          label: procedureLabel(line),
          remaining: lineRemainingBalance(line, paymentControlLines, payments),
        })),
    [paymentControlLines, payments],
  )

  const totalAmount = entries.reduce((sum, entry) => sum + Math.max(0, Math.round(entry.amount || 0)), 0)
  const canClarify = !disabled && Boolean(onAssociatePayment || onSavePaymentNote)

  return (
    <article className="mt-6 rounded-xl border border-dental-200 bg-white p-4 shadow-sm print:hidden">
      <header className="mb-4">
        <h3 className="text-xl font-bold text-dental-800">Comprobantes de Pagos del Paciente</h3>
        <h4 className="mt-1 text-sm font-semibold text-slate-900">
          Visualizar o imprimir todos los pagos
        </h4>
        <p className="mt-1 text-xs text-slate-500">
          Consulte el historial de recibos de caja internos y facturas electrónicas (FEV) emitidos por
          los pagos de este paciente. Cada comprobante debe indicar el procedimiento al que
          corresponde. Si aún no está asociado, puede vincularlo a un procedimiento del plan
          (presupuesto, sección 8) o escribir una descripción.
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
              const needsClarify =
                entry.source === 'control_pagos' && !entry.hasProcedureLink
              const descriptionText = entry.notes?.trim() || ''
              const procedureText = entry.linkedProcedureName?.trim() || ''
              const fallbackReason = entry.paymentReason?.trim() || ''
              const conceptLabel = procedureText
                ? 'Procedimiento'
                : descriptionText
                  ? 'Descripción'
                  : needsClarify
                    ? null
                    : 'Concepto'
              const conceptText =
                procedureText ||
                descriptionText ||
                (needsClarify ? '' : fallbackReason || 'Pago')

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
                      {needsClarify ? (
                        <span className="ml-2 inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-900">
                          Sin procedimiento
                        </span>
                      ) : null}
                    </p>
                    <p className="text-slate-500">
                      {typeLabel} · {sourceLabel} · {PAYMENT_METHOD_LABELS[entry.paymentMethod]}
                    </p>
                    {conceptLabel && conceptText ? (
                      <p className="truncate text-slate-700" title={conceptText}>
                        <span className="font-medium text-slate-800">{conceptLabel}:</span>{' '}
                        {conceptText}
                      </p>
                    ) : needsClarify ? (
                      <p className="text-amber-800">
                        Sin procedimiento asociado. Vincúlelo al plan o agregue una descripción.
                      </p>
                    ) : (
                      <p className="truncate text-slate-600" title={fallbackReason || 'Pago'}>
                        {fallbackReason || 'Pago'}
                      </p>
                    )}
                    {voidedLabel ? <p className="text-rose-700">{voidedLabel}</p> : null}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold tabular-nums text-slate-900">
                      {formatCurrency(entry.amount)}
                    </p>
                    {needsClarify && canClarify ? (
                      <>
                        {onAssociatePayment ? (
                          <button
                            type="button"
                            onClick={() => setClarifyAction({ kind: 'associate', entry })}
                            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 text-[11px] font-semibold text-amber-950 hover:bg-amber-100"
                          >
                            <Link2 className="h-3.5 w-3.5" />
                            Asociar procedimiento
                          </button>
                        ) : null}
                        {onSavePaymentNote ? (
                          <button
                            type="button"
                            onClick={() => setClarifyAction({ kind: 'note', entry })}
                            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                          >
                            <NotebookPen className="h-3.5 w-3.5" />
                            {descriptionText ? 'Editar descripción' : 'Agregar descripción'}
                          </button>
                        ) : null}
                      </>
                    ) : null}
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

      {clarifyAction ? (
        <ClarifyPaymentDialog
          action={clarifyAction}
          procedureOptions={procedureOptions}
          onClose={() => setClarifyAction(null)}
          onAssociate={(paymentId, lineId) => {
            onAssociatePayment?.(paymentId, lineId)
          }}
          onSaveNote={(paymentId, note) => {
            onSavePaymentNote?.(paymentId, note)
          }}
        />
      ) : null}
    </article>
  )
}
