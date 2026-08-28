import type { Anamnesis } from '@/types/anamnesis'
import { normalizeAnamnesis } from '@/types/anamnesis'
import {
  VITAL_SIGNS_NORMAL_RANGES,
  normalizeVitalSignsExam,
  type VitalSignsExam,
} from '@/types/stomatologicalExam'

export interface ClinicalPrecautionAlert {
  active: boolean
  reasons: string[]
  summary: string
}

export function getBloodPressurePrecautionReasons(
  vitalSignsInput?: Partial<VitalSignsExam> | null,
): string[] {
  const vitalSigns = normalizeVitalSignsExam(vitalSignsInput ?? undefined)
  const reasons: string[] = []
  const { systolicPressure, diastolicPressure } = vitalSigns
  const { systolic, diastolic } = VITAL_SIGNS_NORMAL_RANGES

  if (systolicPressure !== null) {
    if (systolicPressure < systolic.min) {
      reasons.push(
        `Presión arterial sistólica baja: ${systolicPressure} mmHg (referencia ${systolic.min}-${systolic.max})`,
      )
    } else if (systolicPressure > systolic.max) {
      reasons.push(
        `Presión arterial sistólica elevada: ${systolicPressure} mmHg (referencia ${systolic.min}-${systolic.max})`,
      )
    }
  }

  if (diastolicPressure !== null) {
    if (diastolicPressure < diastolic.min) {
      reasons.push(
        `Presión arterial diastólica baja: ${diastolicPressure} mmHg (referencia ${diastolic.min}-${diastolic.max})`,
      )
    } else if (diastolicPressure > diastolic.max) {
      reasons.push(
        `Presión arterial diastólica elevada: ${diastolicPressure} mmHg (referencia ${diastolic.min}-${diastolic.max})`,
      )
    }
  }

  return reasons
}

export function getClinicalPrecautionAlert(
  data?: Partial<Anamnesis>,
  vitalSignsInput?: Partial<VitalSignsExam> | null,
): ClinicalPrecautionAlert {
  const anamnesis = normalizeAnamnesis(data)
  const reasons: string[] = []

  if (!anamnesis.allergiesNoReporta) {
    if (anamnesis.allergies.medications.trim()) {
      reasons.push(`Alergia a medicamentos: ${anamnesis.allergies.medications.trim()}`)
    }
    if (anamnesis.allergies.anesthesia.trim()) {
      reasons.push(`Alergia a anestesia: ${anamnesis.allergies.anesthesia.trim()}`)
    }
    if (anamnesis.allergies.other.trim()) {
      reasons.push(`Otras alergias: ${anamnesis.allergies.other.trim()}`)
    }
  }

  if (!anamnesis.systemicDiseasesNoReporta) {
    for (const disease of anamnesis.systemicDiseases) {
      reasons.push(`Enfermedad sistémica: ${disease}`)
    }
    if (anamnesis.systemicDiseasesOther.trim()) {
      reasons.push(`Otras enfermedades: ${anamnesis.systemicDiseasesOther.trim()}`)
    }
  }

  for (const medication of anamnesis.criticalMedications) {
    reasons.push(`Medicación crítica: ${medication}`)
  }

  reasons.push(...getBloodPressurePrecautionReasons(vitalSignsInput))

  return {
    active: reasons.length > 0,
    reasons,
    summary:
      reasons.length > 0
        ? 'Precaución: el paciente tiene antecedentes o signos vitales que requieren evaluación antes del procedimiento.'
        : '',
  }
}
