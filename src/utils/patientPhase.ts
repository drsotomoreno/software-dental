import type { ClinicalRecordFormData } from '@/types/clinicalRecord'
import { calcDentalImplantsBudgetTotal, calcOrthodonticsBudgetTotal } from './budget'

export function validateAcceptTreatment(clinicalData: ClinicalRecordFormData): string | null {
  if (!clinicalData.anamnesis.chiefComplaint.trim()) {
    return 'El motivo de consulta es obligatorio.'
  }

  const hasOrthodonticsBudget =
    clinicalData.orthodonticsBudget?.active &&
    calcOrthodonticsBudgetTotal(clinicalData.orthodonticsBudget) > 0
  const hasDentalImplantsBudget =
    clinicalData.dentalImplantsBudget?.active &&
    calcDentalImplantsBudgetTotal(clinicalData.dentalImplantsBudget) > 0
  const hasBudgetItems = clinicalData.budgetItems.some((item) => item.procedure.trim())

  if (!hasBudgetItems && !hasOrthodonticsBudget && !hasDentalImplantsBudget) {
    return 'Registre al menos un ítem en el presupuesto antes de aceptar.'
  }

  return null
}
