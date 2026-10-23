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

/** Textos que el anexo de periodoncia trae vacíos. No son un tratamiento elegido. */
const DEFAULT_PERIODONTAL_PROCEDURES: Record<string, string> = {
  fase_i: 'Instrucción de higiene oral, control de placa, RAR',
  fase_ii: 'Cirugía periodontal / regenerativa',
  fase_iii: 'Soporte periodontal (mantenimiento)',
}

const ANNEX_TREATMENT_SOURCES = new Set([
  'orthodontics_annex',
  'endodontics_annex',
  'oral_surgery_annex',
  'periodontics_annex',
])

function hasSurgicalTreatment(
  lines: { procedure?: string | null; cupsCode?: string | null }[] | null | undefined,
): boolean {
  return (
    Array.isArray(lines) &&
    lines.some((line) => hasText(line?.procedure) || hasText(line?.cupsCode))
  )
}

function hasCustomPeriodontalTreatment(
  rows:
    | {
        phase?: string
        procedure?: string | null
        plannedDate?: string | null
        notes?: string | null
        status?: string | null
      }[]
    | null
    | undefined,
): boolean {
  if (!Array.isArray(rows)) return false
  return rows.some((row) => {
    const procedure = row?.procedure?.trim() ?? ''
    if (!procedure) return false
    const isDefault = procedure === DEFAULT_PERIODONTAL_PROCEDURES[row?.phase ?? '']
    return (
      !isDefault ||
      hasText(row?.plannedDate) ||
      hasText(row?.notes) ||
      (hasText(row?.status) && row.status !== 'pendiente')
    )
  })
}

function hasVisualRestoration(
  entries: { tratamiento?: string | null }[] | null | undefined,
): boolean {
  return Array.isArray(entries) && entries.some((entry) => hasText(entry?.tratamiento))
}

function hasProsthesisPlan(
  plan: { protesisTotal?: unknown; protesisParcialRemovible?: unknown } | null | undefined,
): boolean {
  return Boolean(plan?.protesisTotal || plan?.protesisParcialRemovible)
}

function hasWhiteningPlan(
  plan:
    | { casero?: boolean; consultorio?: boolean; diente_oscurecido?: boolean }
    | null
    | undefined,
): boolean {
  return Boolean(plan?.casero || plan?.consultorio || plan?.diente_oscurecido)
}

function hasImplantRehabilitation(
  plan:
    | {
        implants?: unknown[]
        rehabilitationPlan?: {
          maxilla?: { category?: string | null }
          mandible?: { category?: string | null }
        }
      }
    | null
    | undefined,
): boolean {
  if ((plan?.implants?.length ?? 0) > 0) return true
  return Boolean(
    hasText(plan?.rehabilitationPlan?.maxilla?.category) ||
      hasText(plan?.rehabilitationPlan?.mandible?.category),
  )
}

/**
 * Tratamientos que los anexos ya dejaron en el plan o en el propio anexo.
 * Son del mismo paciente y forman parte del presupuesto, aunque no haya fila general.
 */
function hasAnnexGeneratedBudget(
  draft: Pick<ClinicalRecordFormData, 'treatmentPlan' | 'specializedAnnexes'> | null | undefined,
): boolean {
  const fromPlan = draft?.treatmentPlan?.some(
    (item) => ANNEX_TREATMENT_SOURCES.has(item?.source ?? '') && hasText(item?.procedure),
  )
  if (fromPlan) return true

  const annexes = draft?.specializedAnnexes
  if (!annexes) return false

  if (hasCustomPeriodontalTreatment(annexes.periodontics?.treatmentPlan)) return true
  if (hasSurgicalTreatment(annexes.oralSurgery?.treatmentPlan)) return true
  if (hasSurgicalTreatment(annexes.dentalImplants?.surgicalRiskAssessment?.treatmentPlan)) {
    return true
  }
  if (hasVisualRestoration(annexes.rehabilitationAesthetics?.visualTreatmentPlan)) return true
  if (hasProsthesisPlan(annexes.rehabilitationAesthetics)) return true
  if (hasWhiteningPlan(annexes.rehabilitationAesthetics?.dentalWhitening)) return true
  if (hasVisualRestoration(annexes.dentalImplants?.visualTreatmentPlan)) return true
  if (hasProsthesisPlan(annexes.dentalImplants)) return true
  if (hasImplantRehabilitation(annexes.dentalImplants?.implantPlacementPlan)) return true

  return false
}

/**
 * El presupuesto de la atención es una sola unidad.
 * Cuenta una fila general o un tratamiento presupuestado desde cualquier anexo.
 */
export function hasRegisteredBudget(
  draft: Pick<
    ClinicalRecordFormData,
    | 'budgetItems'
    | 'orthodonticsBudget'
    | 'dentalImplantsBudget'
    | 'treatmentPlan'
    | 'specializedAnnexes'
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
  if (hasAnnexGeneratedBudget(draft)) return true

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
