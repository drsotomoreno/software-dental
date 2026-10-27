import type { BudgetLineItem, TreatmentPlanItem } from '../types/clinicalRecord.ts'
import {
  formatOrthodonticTreatmentPlan,
  type OrthodonticTreatmentPlanSelection,
} from '../types/orthodonticsAnnex.ts'

function normalizeProcedureName(value: string | undefined): string {
  return (value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
}

/** Nombres con los que el anexo identifica el paquete, distinto de un CUPS suelto. */
export function orthodonticsPackageProcedureNames(
  plan: OrthodonticTreatmentPlanSelection | null | undefined,
): string[] {
  if (!plan?.treatmentType) return []

  const formatted = formatOrthodonticTreatmentPlan(plan) || 'Tratamiento de ortodoncia'
  return [...new Set([formatted, 'Tratamiento de ortodoncia'])]
}

export function isOrthodonticsAnnexPlanItem(
  item: Pick<TreatmentPlanItem, 'source'>,
): boolean {
  return item.source === 'orthodontics_annex'
}

/**
 * El tratamiento de ortodoncia se cobra en la caja verde del presupuesto.
 * La fila del listado clínico repite ese mismo paquete.
 */
export function omitOrthodonticsPackageBudgetLines(
  items: BudgetLineItem[],
  treatmentPlan: Pick<TreatmentPlanItem, 'id' | 'source' | 'procedure'>[],
  extraProcedureNames: string[] = [],
): BudgetLineItem[] {
  const annexItems = treatmentPlan.filter(isOrthodonticsAnnexPlanItem)
  const names = new Set<string>()

  for (const item of annexItems) {
    const procedure = normalizeProcedureName(item.procedure)
    if (procedure) names.add(procedure)
  }
  for (const name of extraProcedureNames) {
    const procedure = normalizeProcedureName(name)
    if (procedure) names.add(procedure)
  }

  if (annexItems.length === 0 && names.size === 0) return items

  const ids = new Set(annexItems.map((item) => item.id))
  return items.filter((line) => {
    if (line.treatmentPlanItemId && ids.has(line.treatmentPlanItemId)) return false
    const procedure = normalizeProcedureName(line.procedure)
    return !procedure || !names.has(procedure)
  })
}
