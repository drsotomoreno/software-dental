import type { PaymentPlanItem, PaymentRecord } from '@/types/clinicalRecord'
import { attachAutoInvoiceToPayment } from '@/services/paymentInvoiceService'
import { generateId } from './crypto'
export function calcTotalPaid(payments: PaymentRecord[]): number {
  return payments.reduce((sum, p) => sum + Math.max(0, p.amount), 0)
}

export function calcTotalInvoiced(payments: PaymentRecord[]): number {
  return payments.reduce(
    (sum, p) => sum + p.invoices.reduce((invSum, inv) => invSum + Math.max(0, inv.amount), 0),
    0,
  )
}

/** Crea registros de pago en borrador desde el plan de pagos (sin duplicar vínculos existentes). */
export function buildPaymentsFromPlan(
  paymentPlan: PaymentPlanItem[],
  existing: PaymentRecord[] = [],
  options?: { userId?: string },
): PaymentRecord[] {  const linked = new Set(existing.map((p) => p.paymentPlanItemId).filter(Boolean))
  const today = new Date().toISOString().slice(0, 10)
  const toAdd: PaymentRecord[] = []

  for (const item of paymentPlan) {
    if (!item.procedure.trim() || linked.has(item.id)) continue
    toAdd.push(
      attachAutoInvoiceToPayment(
        {
          id: generateId(),
          paymentPlanItemId: item.id,
          paymentDate: item.dueDate ?? today,
          amount: item.totalAmount,
          paymentMethod: item.paymentMethod,
          paymentReason: item.procedure,
          invoices: [],
          notes: item.scheduleNotes,
        },
        options?.userId,
      ),
    )  }

  return [...existing, ...toAdd]
}
