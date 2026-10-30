import OrthodonticTreatmentPlanInput from './OrthodonticTreatmentPlanInput'
import OrthodonticCalculator from './calculator/OrthodonticCalculator'
import type { OrthodonticBudgetState } from './calculator/types'
import type {
  AlignerPhaseCount,
  AlignerTreatmentMode,
  ConventionalBracketType,
  MaxillaryOrthopedicsAppliance,
  OrthodonticTreatmentType,
} from '@/types/orthodonticsAnnex'

export interface OrthodonticTreatmentPlanAndBudgetProps {
  treatmentType: OrthodonticTreatmentType
  conventionalBracketType: ConventionalBracketType
  alignerTreatmentMode: AlignerTreatmentMode
  alignerPhaseCount: AlignerPhaseCount
  maxillaryOrthopedicsAppliance: MaxillaryOrthopedicsAppliance
  treatmentDurationMonths: number | null
  orthodonticBudget: OrthodonticBudgetState | null
  onTreatmentPlanChange: (patch: {
    treatmentType?: OrthodonticTreatmentType
    conventionalBracketType?: ConventionalBracketType
    alignerTreatmentMode?: AlignerTreatmentMode
    alignerPhaseCount?: AlignerPhaseCount
    maxillaryOrthopedicsAppliance?: MaxillaryOrthopedicsAppliance
    treatmentDurationMonths?: number | null
  }) => void
  onBudgetChange: (value: OrthodonticBudgetState | null) => void
  disabled?: boolean
}

export default function OrthodonticTreatmentPlanAndBudget({
  treatmentType,
  conventionalBracketType,
  alignerTreatmentMode,
  alignerPhaseCount,
  maxillaryOrthopedicsAppliance,
  treatmentDurationMonths,
  orthodonticBudget,
  onTreatmentPlanChange,
  onBudgetChange,
  disabled = false,
}: OrthodonticTreatmentPlanAndBudgetProps) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 sm:col-span-2">
      <h5 className="mb-3 text-sm font-semibold text-slate-800">
        Plan de Tratamiento y Presupuesto de Ortodoncia
      </h5>

      <div className="space-y-6">
        <OrthodonticTreatmentPlanInput
          treatmentType={treatmentType}
          conventionalBracketType={conventionalBracketType}
          alignerTreatmentMode={alignerTreatmentMode}
          alignerPhaseCount={alignerPhaseCount}
          maxillaryOrthopedicsAppliance={maxillaryOrthopedicsAppliance}
          treatmentDurationMonths={treatmentDurationMonths}
          onTreatmentPlanChange={onTreatmentPlanChange}
          disabled={disabled}
        />

        <OrthodonticCalculator
          plan={{
            treatmentType,
            conventionalBracketType,
            alignerTreatmentMode,
            alignerPhaseCount,
            maxillaryOrthopedicsAppliance,
            treatmentDurationMonths,
          }}
          value={orthodonticBudget}
          onChange={onBudgetChange}
          disabled={disabled}
        />
      </div>
    </div>
  )
}
