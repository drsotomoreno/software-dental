import type { OrthodonticBudgetState } from '@/components/clinical/orthodontics/calculator/types'
import type {
  ClinicalRecordFormData,
  DentalImplantsBudget,
  OrthodonticsBudget,
} from '@/types/clinicalRecord'
import type { EndodonticBudgetState } from '@/types/endoAnnex.types'

const MISSING_CHIEF_COMPLAINT = 'Falta registrar el motivo de consulta'
const MISSING_DIAGNOSIS = 'Falta registrar al menos un diagnóstico en el esquema'
const MISSING_PROCEDURE = 'Falta registrar al menos un procedimiento en el plan'
const MISSING_BUDGET_ITEM = 'Falta registrar al menos un ítem de presupuesto'

function hasText(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0
}

function lineSubtotal(line: { quantity?: number; unitPrice?: number } | undefined): number {
  return Math.max(0, line?.quantity ?? 0) * Math.max(0, line?.unitPrice ?? 0)
}

function orthodonticsBudgetTotal(budget: OrthodonticsBudget | undefined): number {
  if (!budget?.active) return 0
  return (
    lineSubtotal(budget.initialInstallment) +
    lineSubtotal(budget.controls) +
    lineSubtotal(budget.retainers)
  )
}

function dentalImplantsBudgetTotal(budget: DentalImplantsBudget | undefined): number {
  if (!budget?.active) return 0
  return lineSubtotal(budget.implantPlacement) + lineSubtotal(budget.prosthetics)
}

/** Misma fórmula que calculateTotal del anexo de ortodoncia. */
function annexOrthodonticsTotal(state: OrthodonticBudgetState | null | undefined): number {
  if (!state) return 0
  if (state.kind === 'standard') {
    const values = state.values
    return values.initialPayment + values.monthlyControlsCount * values.pricePerControl + values.retainerPrice
  }

  const phasesTotal = state.values.phases.reduce(
    (sum, phase) => sum + phase.initialPayment + phase.monthlyControlsCount * phase.pricePerControl,
    0,
  )
  return phasesTotal + state.values.retainerPrice
}

function endodonticsAnnexTotal(budget: EndodonticBudgetState | null | undefined): number {
  if (!budget?.active) return 0
  return budget.toothLines.reduce((sum, line) => sum + Math.max(0, line.unitPrice), 0)
}

/**
 * El presupuesto de la atención es una sola unidad.
 * Cuenta una fila general o un presupuesto de anexo (ortodoncia, implantes, endodoncia) con valor.
 */
export function hasRegisteredBudget(
  draft: Pick<
    ClinicalRecordFormData,
    'budgetItems' | 'orthodonticsBudget' | 'dentalImplantsBudget' | 'specializedAnnexes'
  > | null | undefined,
): boolean {
  const budgetItems = draft?.budgetItems
  if (Array.isArray(budgetItems) && budgetItems.some((item) => hasText(item?.procedure))) {
    return true
  }

  if (orthodonticsBudgetTotal(draft?.orthodonticsBudget) > 0) return true
  if (dentalImplantsBudgetTotal(draft?.dentalImplantsBudget) > 0) return true
  if (annexOrthodonticsTotal(draft?.specializedAnnexes?.orthodontics?.orthodonticBudget) > 0) {
    return true
  }
  if (endodonticsAnnexTotal(draft?.specializedAnnexes?.endodontics?.budget) > 0) return true

  return false
}

/**
 * Revisa el borrador antes de cerrar la atención.
 * Devuelve instrucciones para el doctor, o un array vacío si el borrador está completo.
 */
export function validateClinicalRecordDraft(
  draft: ClinicalRecordFormData | null | undefined,
): string[] {
  const issues: string[] = []

  if (!hasText(draft?.anamnesis?.chiefComplaint)) {
    issues.push(MISSING_CHIEF_COMPLAINT)
  }

  const chartEntries = draft?.diagnosticChart?.entries
  const hasDiagnosis =
    Array.isArray(chartEntries) &&
    chartEntries.some(
      (entry) => hasText(entry?.diagnosisCode) || hasText(entry?.diagnosisDescription),
    )
  if (!hasDiagnosis) {
    issues.push(MISSING_DIAGNOSIS)
  }

  const treatmentPlan = draft?.treatmentPlan
  const hasProcedure =
    Array.isArray(treatmentPlan) && treatmentPlan.some((item) => hasText(item?.procedure))
  if (!hasProcedure) {
    issues.push(MISSING_PROCEDURE)
  }

  if (!hasRegisteredBudget(draft)) {
    issues.push(MISSING_BUDGET_ITEM)
  }

  return issues
}
