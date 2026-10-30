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

export type OrthodonticTreatmentPlanAndBudgetMode = 'full' | 'plan' | 'budget'

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
  /** full: anexo. plan: sección 7. budget: sección 8. */
  mode?: OrthodonticTreatmentPlanAndBudgetMode
}

const TITLES: Record<OrthodonticTreatmentPlanAndBudgetMode, string> = {
  full: 'Plan de Tratamiento y Presupuesto de Ortodoncia',
  plan: 'Plan de Tratamiento de Ortodoncia',
  budget: 'Presupuesto y Plan de Pago de Ortodoncia',
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
  mode = 'full',
}: OrthodonticTreatmentPlanAndBudgetProps) {
  // En sección 8 el calculador necesita el tipo de tratamiento: si aún no hay, se muestra el plan.
  const showPlan =
    mode === 'full' || mode === 'plan' || (mode === 'budget' && !treatmentType)
  const showBudget = mode === 'full' || mode === 'budget'

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 sm:col-span-2">
      <h5 className="mb-3 text-sm font-semibold text-slate-800">{TITLES[mode]}</h5>

      <div className="space-y-6">
        {showPlan ? (
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
        ) : null}

        {showBudget ? (
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
            showDivider={showPlan}
          />
        ) : null}
      </div>
    </div>
  )
}
