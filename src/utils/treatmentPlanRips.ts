import type { BudgetLineItem, ClinicalRecord, TreatmentPlanItem } from '@/types/clinicalRecord'
import { normalizeCupsCode } from '@/services/catalogService'

function namesMatch(left: string, right: string): boolean {
  const a = left.trim().toLowerCase()
  const b = right.trim().toLowerCase()
  return Boolean(a) && a === b
}

function budgetCoversPlanItem(item: TreatmentPlanItem, budget: BudgetLineItem[]): boolean {
  const cups = item.cupsCode?.trim() ? normalizeCupsCode(item.cupsCode) : ''
  return budget.some((line) => {
    if (line.treatmentPlanItemId && line.treatmentPlanItemId === item.id) return true
    const sameTooth = (line.toothNumber ?? 0) === (item.toothNumber ?? 0)
    const lineCups = line.cupsCode?.trim() ? normalizeCupsCode(line.cupsCode) : ''
    if (cups && lineCups === cups && sameTooth) return true
    return namesMatch(line.procedure ?? '', item.procedure ?? '') && sameTooth
  })
}

/**
 * Filas del plan listas para el JSON RIPS y que aún no viajan en el presupuesto.
 * El NIT queda en `numDocumentoIdObligado` y el REPS en `codPrestador`; esta lista
 * solo aporta procedimientos, diagnóstico CIE, zona y valor.
 */
export function treatmentPlanItemsForRipsPayload(
  record: Pick<ClinicalRecord, 'treatmentPlan' | 'budgetItems'>,
): TreatmentPlanItem[] {
  const budget = record.budgetItems ?? []
  return (record.treatmentPlan ?? []).filter(
    (item) =>
      Boolean((item.procedure ?? '').trim()) &&
      Boolean(item.cupsCode?.trim()) &&
      !budgetCoversPlanItem(item, budget),
  )
}
