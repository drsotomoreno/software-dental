import { useCallback, useEffect, useMemo } from 'react'
import {
  applyPlanScheduleToBudget,
  calculateTotal,
  createBudgetStateForConfig,
  getPlanInstallmentCount,
  getPlanPhaseCount,
  planScheduleMatchesBudget,
  resolveTreatmentConfig,
  type OrthodonticBudgetState,
  type OrthodonticCalculatorPlan,
  type PhaseBudgetFields,
  type StandardBudgetFields,
  type TreatmentConfig,
} from './types'

export interface UseOrthodonticCalcOptions {
  plan: OrthodonticCalculatorPlan
  value: OrthodonticBudgetState | null
  onChange: (value: OrthodonticBudgetState | null) => void
}

function budgetMatchesConfig(
  state: OrthodonticBudgetState | null,
  config: TreatmentConfig | null,
): boolean {
  if (!config) return state == null
  if (!state) return false
  if (config.isMultiPhase) return state.kind === 'multi_phase'
  return state.kind === 'standard'
}

export function useOrthodonticCalc({ plan, value, onChange }: UseOrthodonticCalcOptions) {
  const config = useMemo(
    () => resolveTreatmentConfig(plan),
    [
      plan.treatmentType,
      plan.conventionalBracketType,
      plan.alignerTreatmentMode,
      plan.alignerPhaseCount,
    ],
  )
  const installmentCount = getPlanInstallmentCount(plan)
  const phaseCount = getPlanPhaseCount(plan)

  useEffect(() => {
    if (!config) {
      if (value != null) onChange(null)
      return
    }

    if (!value || !budgetMatchesConfig(value, config)) {
      onChange(createBudgetStateForConfig(config, plan))
      return
    }

    if (!planScheduleMatchesBudget(value, plan)) {
      onChange(applyPlanScheduleToBudget(value, plan))
    }
  }, [
    config,
    installmentCount,
    onChange,
    phaseCount,
    plan.alignerPhaseCount,
    plan.alignerTreatmentMode,
    plan.conventionalBracketType,
    plan.treatmentDurationMonths,
    plan.treatmentType,
    value,
  ])

  const total = useMemo(() => (value ? calculateTotal(value) : 0), [value])

  const updateStandardField = useCallback(
    <K extends keyof StandardBudgetFields>(field: K, fieldValue: StandardBudgetFields[K]) => {
      if (!value || value.kind !== 'standard') return
      if (field === 'monthlyControlsCount') return
      onChange({
        kind: 'standard',
        values: { ...value.values, [field]: fieldValue },
      })
    },
    [onChange, value],
  )

  const updatePhaseField = useCallback(
    <K extends keyof PhaseBudgetFields>(
      phaseIndex: number,
      field: K,
      fieldValue: PhaseBudgetFields[K],
    ) => {
      if (!value || value.kind !== 'multi_phase') return
      if (field === 'monthlyControlsCount') return
      const phases = value.values.phases.map((phase, index) =>
        index === phaseIndex ? { ...phase, [field]: fieldValue } : phase,
      )
      onChange({
        kind: 'multi_phase',
        values: { ...value.values, phases },
      })
    },
    [onChange, value],
  )

  const updateRetainerPrice = useCallback(
    (retainerPrice: number) => {
      if (!value || value.kind !== 'multi_phase') return
      onChange({
        kind: 'multi_phase',
        values: { ...value.values, retainerPrice },
      })
    },
    [onChange, value],
  )

  return {
    config,
    value,
    total,
    installmentCount,
    phaseCount,
    updateStandardField,
    updatePhaseField,
    updateRetainerPrice,
  }
}

export type { OrthodonticBudgetState, TreatmentConfig }
