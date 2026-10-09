import type { BudgetLineItem, BudgetSummary } from '@/types/clinicalRecord'
import type { BudgetCalculation, BudgetItem } from '@/types/pricing'
import { recalcBudgetItem } from '@/hooks/useBudget'
import { calcBillableLineTotal } from '@/utils/cupsBillingRules'

export function budgetLineToItem(line: BudgetLineItem): BudgetItem {
  return recalcBudgetItem({
    id: line.id,
    tariffItemId: line.cupsCode ?? '',
    code: line.cupsCode ?? '',
    description: line.procedure,
    toothNumber: line.toothNumber,
    fdiQuadrant: line.fdiQuadrant,
    arch: line.arch,
    anatomicalZone: line.anatomicalZone,
    diagnosisCode: line.diagnosisCode,
    diagnosisDescription: line.diagnosisDescription,
    treatmentPlanItemId: line.treatmentPlanItemId,
    source: line.source,
    quantity: line.quantity,
    unitPrice: line.unitPrice,
    discount: 0,
    total: calcBillableLineTotal(line.unitPrice, line.quantity, line.cupsCode),
  })
}

export function budgetItemToLine(
  item: BudgetItem,
  existing?: BudgetLineItem,
): BudgetLineItem {
  return {
    id: item.id,
    treatmentPlanItemId: item.treatmentPlanItemId ?? existing?.treatmentPlanItemId,
    procedure: item.description,
    cupsCode: item.code || existing?.cupsCode || undefined,
    toothNumber: item.toothNumber ?? existing?.toothNumber,
    fdiQuadrant: item.fdiQuadrant ?? existing?.fdiQuadrant,
    arch: item.arch ?? existing?.arch,
    anatomicalZone: item.anatomicalZone ?? existing?.anatomicalZone,
    diagnosisCode: item.diagnosisCode ?? existing?.diagnosisCode,
    diagnosisDescription: item.diagnosisDescription ?? existing?.diagnosisDescription,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    source: item.source ?? existing?.source,
  }
}

export function budgetCalculationToSummary(calc: BudgetCalculation): BudgetSummary {
  return {
    subtotal: calc.subtotal,
    discount: calc.globalDiscount,
    total: calc.total,
    currency: calc.currency,
  }
}

export function mapLinesToBudgetItems(lines: BudgetLineItem[]): BudgetItem[] {
  return lines.map(budgetLineToItem)
}

export function mapBudgetItemsToLines(
  items: BudgetItem[],
  previous: BudgetLineItem[],
): BudgetLineItem[] {
  const previousById = new Map(previous.map((line) => [line.id, line]))
  return items.map((item) => budgetItemToLine(item, previousById.get(item.id)))
}
