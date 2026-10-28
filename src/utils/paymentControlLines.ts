import type {
  BudgetLineItem,
  ClinicalRecord,
  PaymentControlLine,
  PaymentRecord,
  TreatmentPlanItem,
} from '@/types/clinicalRecord'
import { normalizeCupsCode } from '@/services/catalogService'
import { calcBillableLineTotal } from '@/utils/cupsBillingRules'
import { generateId } from '@/utils/crypto'
import { formatAnatomicalZone } from '@/utils/treatmentPlanZone'
import { treatmentPlanItemsForRipsPayload } from '@/utils/treatmentPlanRips'
import { calcTotalPaid } from '@/utils/paymentControl'
import { amountAppliedToLine, paymentHasProcedureLink } from '@/utils/paymentAbonos'

function namesMatch(left: string, right: string): boolean {
  const a = left.trim().toLowerCase()
  const b = right.trim().toLowerCase()
  return Boolean(a) && a === b
}

export function normalizePaymentControlLines(
  items: PaymentControlLine[] | undefined,
): PaymentControlLine[] {
  if (!Array.isArray(items)) return []

  return items.map((item) => ({
    id: item?.id || generateId(),
    procedure: item?.procedure ?? '',
    cupsCode: item?.cupsCode,
    toothNumber: item?.toothNumber,
    fdiQuadrant: item?.fdiQuadrant,
    arch: item?.arch,
    anatomicalZone: item?.anatomicalZone,
    quantity: item?.quantity && item.quantity > 0 ? item.quantity : 1,
    unitPrice: Math.max(0, item?.unitPrice ?? 0),
    diagnosisCode: item?.diagnosisCode,
    diagnosisDescription: item?.diagnosisDescription,
    budgetItemId: item?.budgetItemId,
    source: item?.source === 'budget' ? 'budget' : 'manual',
  }))
}

export function emptyPaymentControlLine(): PaymentControlLine {
  return {
    id: generateId(),
    procedure: '',
    quantity: 1,
    unitPrice: 0,
    source: 'manual',
  }
}

export function lineBillablePrice(line: Pick<PaymentControlLine, 'unitPrice' | 'quantity' | 'cupsCode'>): number {
  return calcBillableLineTotal(line.unitPrice ?? 0, line.quantity ?? 1, line.cupsCode)
}

/** Suma el precio facturable de los procedimientos de la tabla. */
export function sumPaymentControlPrices(lines: PaymentControlLine[]): number {
  return lines.reduce((total, line) => total + lineBillablePrice(line), 0)
}

export function paidAmountForLine(lineId: string, payments: PaymentRecord[]): number {
  return payments.reduce((sum, payment) => sum + amountAppliedToLine(payment, lineId), 0)
}

/**
 * Abonos sin procedimiento. Con una sola fila de control, descuentan ese
 * saldo (misma cifra que el pie «Saldo del tratamiento»).
 */
export function unlinkedPaidAmount(
  payments: PaymentRecord[],
  lines?: PaymentControlLine[],
): number {
  const knownLineIds = lines ? new Set(lines.map((line) => line.id)) : undefined
  return payments.reduce((sum, payment) => {
    if (paymentHasProcedureLink(payment, knownLineIds)) return sum
    return sum + Math.max(0, Math.round(payment.amount || 0))
  }, 0)
}

/** Saldo visible de un procedimiento, alineado al total del tratamiento si solo hay una fila. */
export function lineRemainingBalance(
  line: Pick<PaymentControlLine, 'id' | 'unitPrice' | 'quantity' | 'cupsCode'>,
  lines: PaymentControlLine[],
  payments: PaymentRecord[],
): number {
  const billable = lineBillablePrice(line)
  const linkedPaid = paidAmountForLine(line.id, payments)
  const unlinked = lines.length === 1 ? unlinkedPaidAmount(payments, lines) : 0
  return Math.max(0, billable - linkedPaid - unlinked)
}

/** Valor del tratamiento menos los pagos registrados. */
export function treatmentPaymentBalance(
  lines: PaymentControlLine[],
  payments: PaymentRecord[],
): number {
  return Math.max(0, sumPaymentControlPrices(lines) - calcTotalPaid(payments))
}

function lineFromBudgetItem(
  item: BudgetLineItem,
  treatmentPlan: TreatmentPlanItem[],
): PaymentControlLine {
  const linked = item.treatmentPlanItemId
    ? treatmentPlan.find((planItem) => planItem.id === item.treatmentPlanItemId)
    : undefined
  const zoneSource = {
    toothNumber: item.toothNumber ?? linked?.toothNumber,
    fdiQuadrant: item.fdiQuadrant ?? linked?.fdiQuadrant,
    arch: item.arch ?? linked?.arch,
    anatomicalZone:
      item.anatomicalZone ||
      (item.toothNumber || item.fdiQuadrant || item.arch ? undefined : linked?.anatomicalZone),
  }

  return {
    id: generateId(),
    procedure: item.procedure,
    cupsCode: item.cupsCode,
    quantity: item.quantity > 0 ? item.quantity : 1,
    unitPrice: Math.max(0, item.unitPrice || 0),
    diagnosisCode: item.diagnosisCode ?? linked?.diagnosisCode,
    diagnosisDescription: item.diagnosisDescription ?? linked?.diagnosisDescription,
    budgetItemId: item.id,
    source: 'budget',
    ...zoneSource,
    anatomicalZone: formatAnatomicalZone(zoneSource),
  }
}

/** Copia los procedimientos del presupuesto que aún no están en la tabla. */
export function importBudgetIntoPaymentControl(
  budgetItems: BudgetLineItem[],
  treatmentPlan: TreatmentPlanItem[],
  existing: PaymentControlLine[],
): PaymentControlLine[] {
  const byBudgetId = new Map(
    existing.filter((line) => line.budgetItemId).map((line) => [line.budgetItemId as string, line]),
  )
  const linked = new Set(byBudgetId.keys())
  const imported = budgetItems
    .filter((item) => item.procedure.trim() && !linked.has(item.id))
    .map((item) => {
      const line = lineFromBudgetItem(item, treatmentPlan)
      // Reutilizar id estable si ya existió esta fila (no huérfanos de abonos).
      const previous = byBudgetId.get(item.id)
      return previous ? { ...line, id: previous.id } : line
    })

  return imported.length > 0 ? [...existing, ...imported] : existing
}

function sameLocation(
  left: { toothNumber?: number },
  right: { toothNumber?: number },
): boolean {
  return (left.toothNumber ?? 0) === (right.toothNumber ?? 0)
}

function coveredByBudget(line: PaymentControlLine, budget: BudgetLineItem[]): boolean {
  if (line.budgetItemId) {
    const linked = budget.find((item) => item.id === line.budgetItemId)
    if (linked?.cupsCode?.trim()) return true
  }

  const cups = line.cupsCode?.trim() ? normalizeCupsCode(line.cupsCode) : ''
  return budget.some((item) => {
    const itemCups = item.cupsCode?.trim() ? normalizeCupsCode(item.cupsCode) : ''
    if (cups && itemCups === cups && sameLocation(line, item)) return true
    return namesMatch(item.procedure ?? '', line.procedure ?? '') && sameLocation(line, item)
  })
}

function coveredByPlan(line: PaymentControlLine, plan: TreatmentPlanItem[]): boolean {
  const cups = line.cupsCode?.trim() ? normalizeCupsCode(line.cupsCode) : ''
  return plan.some((item) => {
    const itemCups = item.cupsCode?.trim() ? normalizeCupsCode(item.cupsCode) : ''
    if (cups && itemCups === cups && sameLocation(line, item)) return true
    return namesMatch(item.procedure ?? '', line.procedure ?? '') && sameLocation(line, item)
  })
}

/**
 * Filas de control de pagos que deben viajar en el JSON RIPS.
 * El NIT queda en `numDocumentoIdObligado` y el REPS en `codPrestador`;
 * estas filas solo aportan procedimiento, diagnóstico CIE, zona y valor,
 * y se omiten si el presupuesto o el plan ya las reportan.
 */
export function paymentControlLinesForRipsPayload(
  record: Pick<ClinicalRecord, 'paymentControlLines' | 'budgetItems' | 'treatmentPlan'>,
): PaymentControlLine[] {
  const budget = record.budgetItems ?? []
  const plan = treatmentPlanItemsForRipsPayload(record)

  return (record.paymentControlLines ?? []).filter(
    (line) =>
      Boolean((line.procedure ?? '').trim()) &&
      Boolean(line.cupsCode?.trim()) &&
      !coveredByBudget(line, budget) &&
      !coveredByPlan(line, plan),
  )
}
