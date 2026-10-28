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

/** Hay montos capturados (no basta `active` vacío / fantasma). */
export function orthodonticsBudgetHasMonetaryValues(
  budget:
    | {
        initialInstallment?: { quantity?: number; unitPrice?: number } | null
        controls?: { quantity?: number; unitPrice?: number } | null
        retainers?: { quantity?: number; unitPrice?: number } | null
      }
    | null
    | undefined,
): boolean {
  if (!budget) return false
  const lines = [budget.initialInstallment, budget.controls, budget.retainers]
  return lines.some((line) => {
    if (!line) return false
    return Math.max(0, Number(line.quantity) || 0) * Math.max(0, Number(line.unitPrice) || 0) > 0
  })
}

/**
 * Caja verde de presupuesto de ortodoncia (sección 8):
 * - plan de ortodoncia del anexo, o
 * - presupuesto incluido con montos reales.
 * Un `active: true` sin montos (fantasma) no debe mostrarla.
 */
export function shouldShowOrthodonticsBudgetSection(
  orthodonticsBudget: { active?: boolean } | null | undefined,
  treatmentPlan: Pick<TreatmentPlanItem, 'source'>[],
): boolean {
  if (treatmentPlan.some(isOrthodonticsAnnexPlanItem)) return true
  if (orthodonticsBudget?.active && orthodonticsBudgetHasMonetaryValues(orthodonticsBudget)) {
    return true
  }
  return false
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
