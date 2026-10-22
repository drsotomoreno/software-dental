import type {
  OrthodonticsBudget,
  OrthodonticsPaymentRecord,
  OrthodonticsPaymentType,
} from '@/types/clinicalRecord'
import { calcOrthodonticsBudgetTotal, lineSubtotal } from './budget'
import { attachAutoInvoiceToPayment } from '@/services/paymentInvoiceService'
import { generateId } from './crypto'
import { calcOrthodonticsPaymentsTotal } from './orthodonticsPaymentConcepts'

export type { OrthodonticsPaymentConcept } from './orthodonticsPaymentConcepts'
export {
  ORTHODONTICS_CONCEPT_LABELS,
  conceptForOrthodonticsProcedure,
  paymentTypeForConcept,
  paymentsForConcept,
  paidAmountForConcept,
  conceptRemaining,
  getOrthodonticsControlNumbers,
  getPaidControlNumbers,
  suggestControlNumber,
  hasInitialInstallmentPaid,
  calcOrthodonticsPaymentsTotal,
} from './orthodonticsPaymentConcepts'

export const ORTHODONTICS_PAYMENT_TYPE_LABELS: Record<OrthodonticsPaymentType, string> = {
  cuota_inicial: 'Cuota inicial',
  control: 'Control',
  retenedores: 'Retenedores',
  adicional: 'Pago adicional',
}

export function buildOrthodonticsPaymentReason(
  paymentType: OrthodonticsPaymentType,
  controlNumber?: number,
  additionalDescription?: string,
): string {
  switch (paymentType) {
    case 'cuota_inicial':
      return 'Cuota inicial — ortodoncia'
    case 'control':
      return `Control ortodoncia #${controlNumber ?? '?'}`
    case 'retenedores':
      return 'Retenedores — ortodoncia'
    case 'adicional':
      return additionalDescription?.trim()
        ? `Pago adicional — ${additionalDescription.trim()}`
        : 'Pago adicional — ortodoncia'
  }
}

export function suggestOrthodonticsPaymentAmount(
  paymentType: OrthodonticsPaymentType,
  budget: OrthodonticsBudget,
): number {
  switch (paymentType) {
    case 'cuota_inicial':
      return lineSubtotal(budget.initialInstallment)
    case 'control':
      return Math.max(0, budget.controls.unitPrice)
    case 'retenedores':
      return lineSubtotal(budget.retainers)
    case 'adicional':
      return 0
  }
}

export function calcOrthodonticsInvoicedTotal(payments: OrthodonticsPaymentRecord[]): number {
  return payments.reduce(
    (sum, p) => sum + p.invoices.reduce((invSum, inv) => invSum + (inv.amount || 0), 0),
    0,
  )
}

export function createEmptyOrthodonticsPayment(
  budget: OrthodonticsBudget,
  paymentType: OrthodonticsPaymentType = 'cuota_inicial',
  userId?: string,
): OrthodonticsPaymentRecord {
  const controlNumber = paymentType === 'control' ? 1 : undefined
  const paymentReason = buildOrthodonticsPaymentReason(paymentType, controlNumber)
  const paymentDate = new Date().toISOString().slice(0, 10)
  const amount = suggestOrthodonticsPaymentAmount(paymentType, budget)

  return attachAutoInvoiceToPayment(
    {
      id: generateId(),
      paymentDate,
      amount,
      paymentMethod: 'contado',
      paymentType,
      controlNumber,
      additionalPaymentDescription: '',
      paymentReason,
      invoices: [],
    },
    userId,
  )
}
export function normalizeOrthodonticsPayment(
  payment: Partial<OrthodonticsPaymentRecord>,
  budget: OrthodonticsBudget,
): OrthodonticsPaymentRecord {
  const paymentType = payment.paymentType ?? 'cuota_inicial'
  const controlNumber =
    paymentType === 'control' ? payment.controlNumber ?? 1 : undefined
  const additionalPaymentDescription =
    paymentType === 'adicional' ? payment.additionalPaymentDescription ?? '' : undefined

  return attachAutoInvoiceToPayment(
    {
      id: payment.id ?? generateId(),
      paymentDate: payment.paymentDate ?? new Date().toISOString().slice(0, 10),
      amount: payment.amount ?? suggestOrthodonticsPaymentAmount(paymentType, budget),
      paymentMethod: payment.paymentMethod ?? 'contado',
      paymentType,
      controlNumber,
      additionalPaymentDescription,
      paymentReason:
        payment.paymentReason ??
        buildOrthodonticsPaymentReason(
          paymentType,
          controlNumber,
          additionalPaymentDescription,
        ),
      invoices: payment.invoices ?? [],
      notes: payment.notes,
    },
    undefined,
  )
}

export function orthodonticsPaymentBalance(
  budget: OrthodonticsBudget,
  payments: OrthodonticsPaymentRecord[],
): number {
  return Math.max(0, calcOrthodonticsBudgetTotal(budget) - calcOrthodonticsPaymentsTotal(payments))
}
