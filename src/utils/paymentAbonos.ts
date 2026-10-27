import type { PaymentDocumentKind, PaymentInvoice, PaymentRecord } from '../types/clinicalRecord'
import { formatCurrency } from './crypto.ts'

export function parseAbonoAmount(raw: string): number {
  const digits = raw.replace(/[^\d]/g, '')
  if (!digits) return 0
  const parsed = Number(digits)
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0
}

export function abonoFitsBalance(amount: number, remaining: number): boolean {
  return amount > 0 && amount <= Math.max(0, Math.round(remaining))
}

export function remainingAfterAbono(remaining: number, amount: number): number {
  return Math.max(0, Math.round(remaining) - Math.max(0, Math.round(amount)))
}

type PaymentReceiptSource = {
  invoices?: PaymentInvoice[]
  documentKind?: PaymentDocumentKind
}

export function latestPaymentInvoice(payment: PaymentReceiptSource): PaymentInvoice | undefined {
  return [...(payment.invoices ?? [])].reverse().find((item) => Boolean(item.invoiceNumber) || item.amount > 0)
}

export function resolvePaymentDocumentKind(payment: PaymentReceiptSource): PaymentDocumentKind | null {
  const invoice = latestPaymentInvoice(payment)
  if (invoice?.emissionMode === 'provider') return 'factura'
  if (invoice?.emissionMode === 'manual') return 'recibo_interno'
  if (payment.documentKind === 'factura' || payment.documentKind === 'recibo_interno') {
    return payment.documentKind
  }
  return null
}

/** El tipo guardado sigue al comprobante que sí se generó. */
export function documentKindFromEmission(
  requested: PaymentDocumentKind,
  emissionMode?: PaymentInvoice['emissionMode'],
): PaymentDocumentKind {
  if (emissionMode === 'provider') return 'factura'
  if (emissionMode === 'manual') return 'recibo_interno'
  return requested
}

export function paymentReceiptActionLabel(kind: PaymentDocumentKind | null): string {
  if (kind === 'factura') return 'Ver Factura'
  if (kind === 'recibo_interno') return 'Ver Recibo'
  return 'Ver Recibo / Factura'
}

export function paymentReceiptTypeLabel(kind: PaymentDocumentKind | null): string {
  if (kind === 'factura') return 'Factura'
  if (kind === 'recibo_interno') return 'Recibo Interno'
  return 'Comprobante'
}

export type ProcedurePaymentTone = 'paid' | 'empty' | 'due'

export function procedurePaymentStatus(
  remaining: number,
  paid: number,
): { label: string; tone: ProcedurePaymentTone; className: string } {
  if (remaining <= 0 && paid > 0) {
    return { label: 'Pagado', tone: 'paid', className: 'bg-green-100 text-green-800' }
  }
  if (remaining <= 0) {
    return { label: 'Sin saldo', tone: 'empty', className: 'bg-slate-200 text-slate-600' }
  }
  return {
    label: `Saldo ${formatCurrency(remaining)}`,
    tone: 'due',
    className: 'bg-amber-100 text-amber-900',
  }
}

export interface PaymentAbonoView {
  payment: PaymentRecord
  /** Valor de este procedimiento dentro del comprobante. En un paquete no es el total del recibo. */
  appliedAmount: number
  remainingBalance: number
  documentKind: PaymentDocumentKind | null
}

export function amountAppliedToLine(
  payment: Pick<PaymentRecord, 'paymentControlLineId' | 'amount' | 'lineAllocations'>,
  lineId: string,
): number {
  if (payment.lineAllocations?.length) {
    return payment.lineAllocations
      .filter((item) => item.lineId === lineId)
      .reduce((sum, item) => sum + Math.max(0, Math.round(item.amount || 0)), 0)
  }
  if (payment.paymentControlLineId !== lineId) return 0
  return Math.max(0, Math.round(payment.amount || 0))
}

export function paymentHasProcedureLink(
  payment: Pick<PaymentRecord, 'paymentControlLineId' | 'lineAllocations'>,
): boolean {
  if (payment.paymentControlLineId) return true
  return Boolean(payment.lineAllocations?.some((item) => item.lineId && item.amount > 0))
}

/** Historial del procedimiento en el orden en que se registraron los abonos. */
export function abonoHistoryForLine(
  lineId: string,
  billable: number,
  payments: PaymentRecord[],
): PaymentAbonoView[] {
  let runningPaid = 0
  const history: PaymentAbonoView[] = []

  for (const payment of payments) {
    const applied = amountAppliedToLine(payment, lineId)
    if (applied <= 0) continue
    runningPaid += applied
    const computed = Math.max(0, Math.round(billable) - runningPaid)
    const bundled = Boolean(payment.lineAllocations?.length)
    history.push({
      payment,
      appliedAmount: applied,
      remainingBalance: bundled
        ? computed
        : typeof payment.remainingBalance === 'number'
          ? Math.max(0, Math.round(payment.remainingBalance))
          : computed,
      documentKind: resolvePaymentDocumentKind(payment),
    })
  }

  return history
}

export function formatAbonoDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim())
  if (!match) return value
  return `${match[3]}/${match[2]}/${match[1]}`
}
