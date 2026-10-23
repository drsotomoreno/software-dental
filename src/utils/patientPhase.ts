import type { ClinicalRecordFormData } from '@/types/clinicalRecord'
import { hasRegisteredBudget } from './validateClinicalRecordDraft.ts'

export function validateAcceptTreatment(clinicalData: ClinicalRecordFormData): string | null {
  if (!clinicalData.anamnesis.chiefComplaint.trim()) {
    return 'El motivo de consulta es obligatorio.'
  }

  if (!hasRegisteredBudget(clinicalData)) {
    return 'Registre al menos un ítem en el presupuesto antes de aceptar.'
  }

  return null
}
