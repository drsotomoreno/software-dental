/**
 * Lectura híbrida para la sección unificada
 * «7. Plan de Tratamiento y Presupuesto».
 *
 * Mantiene `treatmentPlan` y `budgetItems` como fuentes persistidas
 * (retrocompatibilidad médico-legal). Solo fusiona en memoria para la UI:
 * - Filas del plan (autoridad clínica + proyección a presupuesto).
 * - Huérfanas del presupuesto (registros antiguos sin vínculo al plan).
 */
import type { BudgetLineItem, TreatmentPlanItem } from '../types/clinicalRecord.ts'
import { omitOrthodonticsPackageBudgetLines } from './orthodonticsBudgetLines.ts'

export type UnifiedPlanBudgetKind = 'plan' | 'budget_orphan'

export interface UnifiedPlanBudgetRow {
  kind: UnifiedPlanBudgetKind
  /** Id estable de la fila visible (plan.id o budget.id). */
  rowId: string
  planItem?: TreatmentPlanItem
  budgetItem?: BudgetLineItem
  /** Vista editable unificada (misma forma que TreatmentPlanItem). */
  view: TreatmentPlanItem
}

function budgetLineToPlanView(line: BudgetLineItem): TreatmentPlanItem {
  return {
    id: line.id,
    phase: 'fase_ii',
    procedure: line.procedure ?? '',
    cupsCode: line.cupsCode,
    toothNumber: line.toothNumber,
    fdiQuadrant: line.fdiQuadrant,
    arch: line.arch,
    anatomicalZone: line.anatomicalZone,
    quantity: line.quantity ?? 1,
    unitPrice: line.unitPrice ?? 0,
    diagnosisCode: line.diagnosisCode,
    diagnosisDescription: line.diagnosisDescription,
    patientApproved: 'pendiente',
    executionStatus: 'pendiente',
    source: line.source === 'manual' || !line.source ? 'manual' : 'sugerencia',
  }
}

function planIdsCoveredByBudget(
  treatmentPlan: TreatmentPlanItem[],
  budgetItems: BudgetLineItem[],
): Set<string> {
  const planIds = new Set(treatmentPlan.map((item) => item.id))
  const covered = new Set<string>()
  for (const line of budgetItems) {
    if (line.treatmentPlanItemId && planIds.has(line.treatmentPlanItemId)) {
      covered.add(line.treatmentPlanItemId)
    }
  }
  return covered
}

/** Líneas de presupuesto sin vínculo usable a una fila del plan. */
export function listBudgetOrphanLines(
  treatmentPlan: TreatmentPlanItem[],
  budgetItems: BudgetLineItem[],
): BudgetLineItem[] {
  const clinical = omitOrthodonticsPackageBudgetLines(budgetItems, treatmentPlan)
  const planIds = new Set(treatmentPlan.map((item) => item.id))
  return clinical.filter((line) => {
    if (!line.treatmentPlanItemId) return true
    return !planIds.has(line.treatmentPlanItemId)
  })
}

/**
 * Filas para la tabla maestra unificada.
 * No escribe en Dexie/Postgres: solo proyección de lectura.
 */
export function resolveUnifiedTreatmentBudgetRows(
  treatmentPlan: TreatmentPlanItem[],
  budgetItems: BudgetLineItem[] = [],
): UnifiedPlanBudgetRow[] {
  const planRows: UnifiedPlanBudgetRow[] = treatmentPlan.map((item) => ({
    kind: 'plan',
    rowId: item.id,
    planItem: item,
    view: item,
  }))

  const orphans = listBudgetOrphanLines(treatmentPlan, budgetItems)
  const orphanRows: UnifiedPlanBudgetRow[] = orphans.map((line) => ({
    kind: 'budget_orphan',
    rowId: line.id,
    budgetItem: line,
    view: budgetLineToPlanView(line),
  }))

  // Evita duplicar visualmente si un huérfano ya aparece como plan por id coincidente.
  const planRowIds = new Set(planRows.map((row) => row.rowId))
  const uniqueOrphans = orphanRows.filter((row) => !planRowIds.has(row.rowId))

  void planIdsCoveredByBudget
  return [...planRows, ...uniqueOrphans]
}

/** Aplica un patch de vista a una línea huérfana del presupuesto. */
export function patchBudgetOrphanLine(
  budgetItems: BudgetLineItem[],
  orphanId: string,
  patch: Partial<TreatmentPlanItem>,
): BudgetLineItem[] {
  return budgetItems.map((line) => {
    if (line.id !== orphanId) return line
    return {
      ...line,
      procedure: patch.procedure ?? line.procedure,
      cupsCode: patch.cupsCode !== undefined ? patch.cupsCode : line.cupsCode,
      toothNumber: patch.toothNumber !== undefined ? patch.toothNumber : line.toothNumber,
      fdiQuadrant: patch.fdiQuadrant !== undefined ? patch.fdiQuadrant : line.fdiQuadrant,
      arch: patch.arch !== undefined ? patch.arch : line.arch,
      anatomicalZone:
        patch.anatomicalZone !== undefined ? patch.anatomicalZone : line.anatomicalZone,
      quantity: patch.quantity !== undefined ? patch.quantity : line.quantity,
      unitPrice: patch.unitPrice !== undefined ? patch.unitPrice : line.unitPrice,
      diagnosisCode:
        patch.diagnosisCode !== undefined ? patch.diagnosisCode : line.diagnosisCode,
      diagnosisDescription:
        patch.diagnosisDescription !== undefined
          ? patch.diagnosisDescription
          : line.diagnosisDescription,
    }
  })
}
