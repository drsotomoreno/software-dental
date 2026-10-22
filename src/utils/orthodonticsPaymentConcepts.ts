import type {
  OrthodonticsBudget,
  OrthodonticsPaymentRecord,
  OrthodonticsPaymentType,
} from '@/types/clinicalRecord'

/**
 * Concepto de cada tarjeta del acuerdo de pago.
 * `controles` se guarda como `control` para no romper abonos ya persistidos en IndexedDB.
 */
export type OrthodonticsPaymentConcept = 'cuota_inicial' | 'controles' | 'retenedores'

export const ORTHODONTICS_CONCEPT_LABELS: Record<OrthodonticsPaymentConcept, string> = {
  cuota_inicial: 'Cuota inicial',
  controles: 'Controles',
  retenedores: 'Retenedores',
}

const CONCEPT_BY_PROCEDURE: Record<string, OrthodonticsPaymentConcept> = {
  'Ortodoncia — Cuota inicial': 'cuota_inicial',
  'Ortodoncia — Controles': 'controles',
  'Ortodoncia — Retenedores': 'retenedores',
}

export function conceptForOrthodonticsProcedure(
  procedure: string,
): OrthodonticsPaymentConcept | null {
  return CONCEPT_BY_PROCEDURE[procedure] ?? null
}

export function paymentTypeForConcept(
  concept: OrthodonticsPaymentConcept,
): OrthodonticsPaymentType {
  if (concept === 'controles') return 'control'
  return concept
}

export function paymentsForConcept(
  payments: OrthodonticsPaymentRecord[],
  concept: OrthodonticsPaymentConcept,
): OrthodonticsPaymentRecord[] {
  const paymentType = paymentTypeForConcept(concept)
  return payments.filter((payment) => payment.paymentType === paymentType)
}

export function paidAmountForConcept(
  payments: OrthodonticsPaymentRecord[],
  concept: OrthodonticsPaymentConcept,
): number {
  return paymentsForConcept(payments, concept).reduce(
    (sum, payment) => sum + (payment.amount || 0),
    0,
  )
}

/** Saldo del concepto de la tarjeta. No descuenta abonos de otros conceptos. */
export function conceptRemaining(
  totalAmount: number,
  payments: OrthodonticsPaymentRecord[],
  concept: OrthodonticsPaymentConcept,
): number {
  return Math.max(0, Math.round(totalAmount) - paidAmountForConcept(payments, concept))
}

export function getOrthodonticsControlNumbers(budget: OrthodonticsBudget): number[] {
  const count = Math.max(0, Math.floor(budget.controls.quantity))
  return Array.from({ length: count }, (_, i) => i + 1)
}

export function getPaidControlNumbers(payments: OrthodonticsPaymentRecord[]): number[] {
  return payments
    .filter((payment) => payment.paymentType === 'control' && payment.controlNumber)
    .map((payment) => payment.controlNumber!)
}

/** Siguiente control sin abono. Si todos tienen abono, vuelve al primero presupuestado. */
export function suggestControlNumber(
  budget: OrthodonticsBudget,
  payments: OrthodonticsPaymentRecord[],
): number {
  const numbers = getOrthodonticsControlNumbers(budget)
  if (numbers.length === 0) return 1
  const paid = new Set(getPaidControlNumbers(payments))
  return numbers.find((num) => !paid.has(num)) ?? numbers[0]
}

export function hasInitialInstallmentPaid(payments: OrthodonticsPaymentRecord[]): boolean {
  return payments.some((payment) => payment.paymentType === 'cuota_inicial')
}

export function calcOrthodonticsPaymentsTotal(payments: OrthodonticsPaymentRecord[]): number {
  return payments.reduce((sum, payment) => sum + (payment.amount || 0), 0)
}
