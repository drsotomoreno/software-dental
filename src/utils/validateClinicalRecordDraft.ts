import type { ClinicalRecordFormData } from '@/types/clinicalRecord'
import {
  diagnosisHasAnatomicalAssociation,
  diagnosisLocationLabel,
} from './diagnosisAssociation.ts'

const MISSING_CHIEF_COMPLAINT = 'Falta registrar el motivo de consulta'
const MISSING_DIAGNOSIS = 'Falta registrar al menos un diagnóstico en el esquema'
const MISSING_PROCEDURE = 'Falta registrar al menos un procedimiento en el plan'
const MISSING_BUDGET_ITEM = 'Falta registrar al menos un ítem de presupuesto'

function hasText(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0
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

  const chartEntries = Array.isArray(draft?.diagnosticChart?.entries)
    ? draft.diagnosticChart.entries
    : []
  const diagnoses = Array.isArray(draft?.diagnoses) ? draft.diagnoses : []
  const hasChartDiagnosis = chartEntries.some(
    (entry) => hasText(entry?.diagnosisCode) || hasText(entry?.diagnosisDescription),
  )
  const hasLocatedDiagnosis = diagnoses.some((diagnosis) => diagnosisLocationLabel(diagnosis))
  const missingAssociation = diagnoses.filter(
    (diagnosis) => !diagnosisHasAnatomicalAssociation(diagnosis, chartEntries),
  )

  if (!hasChartDiagnosis && !hasLocatedDiagnosis && missingAssociation.length === 0) {
    issues.push(MISSING_DIAGNOSIS)
  }

  if (missingAssociation.length === 1) {
    issues.push(
      `El diagnóstico ${missingAssociation[0].code} debe asociarse a un diente, a un maxilar o a toda la dentición.`,
    )
  } else if (missingAssociation.length > 1) {
    const codes = missingAssociation.map((diagnosis) => diagnosis.code).join(', ')
    issues.push(
      `Estos diagnósticos deben asociarse a un diente, a un maxilar o a toda la dentición: ${codes}.`,
    )
  }

  const treatmentPlan = draft?.treatmentPlan
  const hasProcedure =
    Array.isArray(treatmentPlan) && treatmentPlan.some((item) => hasText(item?.procedure))
  if (!hasProcedure) {
    issues.push(MISSING_PROCEDURE)
  }

  const budgetItems = draft?.budgetItems
  const hasBudgetItem =
    Array.isArray(budgetItems) && budgetItems.some((item) => hasText(item?.procedure))
  if (!hasBudgetItem) {
    issues.push(MISSING_BUDGET_ITEM)
  }

  return issues
}
