import type { Cie10Diagnosis, TreatmentPlanItem } from '@/types/clinicalRecord'
import { generateId } from './crypto'

const DEFAULT_TREATMENT_PHASE = 'fase_ii' as const

export function importDiagnosesToTreatmentPlan(
  diagnoses: Cie10Diagnosis[],
  plan: TreatmentPlanItem[],
): TreatmentPlanItem[] {
  const importedCodes = new Set(
    plan.filter((item) => item.diagnosisCode).map((item) => item.diagnosisCode),
  )

  const additions = diagnoses
    .filter((diagnosis) => !importedCodes.has(diagnosis.code))
    .map((diagnosis) => {
      const affectedTeeth = diagnosis.affectedTeeth ?? []
      return {
        id: generateId(),
        phase: DEFAULT_TREATMENT_PHASE,
        procedure: '',
        diagnosisCode: diagnosis.code,
        diagnosisDescription: diagnosis.description,
        toothNumber: affectedTeeth[0],
        quantity: 1,
        unitPrice: 0,
        patientApproved: 'pendiente' as const,
        executionStatus: 'pendiente' as const,
        source: 'diagnostico' as const,
        notes:
          affectedTeeth.length > 1
            ? `Piezas FDI: ${[...affectedTeeth].sort((a, b) => a - b).join(', ')}`
            : undefined,
      }
    })

  return [...plan, ...additions]
}
