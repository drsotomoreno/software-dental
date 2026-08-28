import type {
  AlignerPhaseCount,
  AlignerTreatmentMode,
  ConventionalBracketType,
  OrthodonticTreatmentPlanSelection,
  OrthodonticTreatmentType,
} from '@/types/orthodonticsAnnex'
import {
  formatOrthodonticTreatmentPlan,
  orthodonticTreatmentTypeUsesAligners,
} from '@/types/orthodonticsAnnex'

export interface TreatmentConfig {
  id: string
  name: string
  isMultiPhase: boolean
}

export interface StandardBudgetFields {
  initialPayment: number
  monthlyControlsCount: number
  pricePerControl: number
  retainerPrice: number
}

export interface PhaseBudgetFields {
  phaseName: string
  initialPayment: number
  monthlyControlsCount: number
  pricePerControl: number
}

export interface MultiPhaseBudgetFields {
  phases: PhaseBudgetFields[]
  retainerPrice: number
}

export type OrthodonticBudgetState =
  | { kind: 'standard'; values: StandardBudgetFields }
  | { kind: 'multi_phase'; values: MultiPhaseBudgetFields }

export const EMPTY_STANDARD_BUDGET: StandardBudgetFields = {
  initialPayment: 0,
  monthlyControlsCount: 0,
  pricePerControl: 0,
  retainerPrice: 0,
}

export function createEmptyPhase(phaseIndex: number): PhaseBudgetFields {
  return {
    phaseName: `Fase ${phaseIndex + 1}`,
    initialPayment: 0,
    monthlyControlsCount: 0,
    pricePerControl: 0,
  }
}

export function createEmptyMultiPhaseBudget(phaseCount = 1): MultiPhaseBudgetFields {
  const safeCount = Math.max(1, phaseCount)
  return {
    phases: Array.from({ length: safeCount }, (_, index) => createEmptyPhase(index)),
    retainerPrice: 0,
  }
}

export function parseAlignerPhaseCount(count: AlignerPhaseCount): number {
  if (count === '2' || count === '3' || count === '4') {
    return Number(count)
  }
  return 1
}

export function resolveTreatmentConfig(
  plan: OrthodonticTreatmentPlanSelection,
): TreatmentConfig | null {
  if (!plan.treatmentType) return null

  if (
    orthodonticTreatmentTypeUsesAligners(plan.treatmentType) &&
    plan.alignerTreatmentMode === 'por_fases'
  ) {
    return {
      id: 'alineadores_por_fases',
      name: 'Alineadores por fases',
      isMultiPhase: true,
    }
  }

  return {
    id: plan.treatmentType,
    name: formatOrthodonticTreatmentPlan(plan) || plan.treatmentType,
    isMultiPhase: false,
  }
}

export type OrthodonticCalculatorPlan = OrthodonticTreatmentPlanSelection & {
  treatmentDurationMonths: number | null
}

export function getPlanInstallmentCount(plan: OrthodonticCalculatorPlan): number {
  return plan.treatmentDurationMonths ?? 0
}

export function getPlanPhaseCount(plan: OrthodonticCalculatorPlan): number {
  return parseAlignerPhaseCount(plan.alignerPhaseCount)
}

export function createBudgetStateForConfig(
  config: TreatmentConfig,
  plan: OrthodonticCalculatorPlan,
): OrthodonticBudgetState {
  if (config.isMultiPhase) {
    return applyPlanScheduleToBudget(
      {
        kind: 'multi_phase',
        values: createEmptyMultiPhaseBudget(getPlanPhaseCount(plan)),
      },
      plan,
    )
  }

  return applyPlanScheduleToBudget(
    {
      kind: 'standard',
      values: { ...EMPTY_STANDARD_BUDGET },
    },
    plan,
  )
}

export function applyPlanScheduleToBudget(
  state: OrthodonticBudgetState,
  plan: OrthodonticCalculatorPlan,
): OrthodonticBudgetState {
  const installments = getPlanInstallmentCount(plan)

  if (state.kind === 'standard') {
    return {
      kind: 'standard',
      values: {
        ...state.values,
        monthlyControlsCount: installments,
      },
    }
  }

  const targetPhaseCount = Math.max(1, getPlanPhaseCount(plan))
  const phases = Array.from({ length: targetPhaseCount }, (_, index) => {
    const existing = state.values.phases[index]
    return {
      phaseName: existing?.phaseName?.trim() || `Fase ${index + 1}`,
      initialPayment: existing?.initialPayment ?? 0,
      monthlyControlsCount: installments,
      pricePerControl: existing?.pricePerControl ?? 0,
    }
  })

  return {
    kind: 'multi_phase',
    values: {
      ...state.values,
      phases,
    },
  }
}

export function planScheduleMatchesBudget(
  state: OrthodonticBudgetState,
  plan: OrthodonticCalculatorPlan,
): boolean {
  const installments = getPlanInstallmentCount(plan)

  if (state.kind === 'standard') {
    return state.values.monthlyControlsCount === installments
  }

  const expectedPhases = Math.max(1, getPlanPhaseCount(plan))
  if (state.values.phases.length !== expectedPhases) return false

  return state.values.phases.every((phase) => phase.monthlyControlsCount === installments)
}

export function calculateStandardTotal(values: StandardBudgetFields): number {
  return (
    values.initialPayment +
    values.monthlyControlsCount * values.pricePerControl +
    values.retainerPrice
  )
}

export function calculateMultiPhaseTotal(values: MultiPhaseBudgetFields): number {
  const phasesTotal = values.phases.reduce(
    (sum, phase) =>
      sum + phase.initialPayment + phase.monthlyControlsCount * phase.pricePerControl,
    0,
  )
  return phasesTotal + values.retainerPrice
}

/** Cálculo puro O(n), sin efectos secundarios. */
export function calculateTotal(state: OrthodonticBudgetState): number {
  if (state.kind === 'standard') {
    return calculateStandardTotal(state.values)
  }
  return calculateMultiPhaseTotal(state.values)
}

export function formatCurrency(amount: number): string {
  return amount.toLocaleString('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  })
}

export function formatOrthodonticBudgetSummary(state: OrthodonticBudgetState | null): string {
  if (!state) return ''
  const total = calculateTotal(state)

  if (state.kind === 'standard') {
    const { initialPayment, monthlyControlsCount, pricePerControl, retainerPrice } = state.values
    return [
      `Inicial: ${formatCurrency(initialPayment)}`,
      `Cuotas (${monthlyControlsCount} × ${formatCurrency(pricePerControl)}): ${formatCurrency(monthlyControlsCount * pricePerControl)}`,
      `Retenedor: ${formatCurrency(retainerPrice)}`,
      `Total: ${formatCurrency(total)}`,
    ].join(' · ')
  }

  const phaseLines = state.values.phases.map((phase, index) => {
    const phaseTotal =
      phase.initialPayment + phase.monthlyControlsCount * phase.pricePerControl
    return `${phase.phaseName || `Fase ${index + 1}`}: ${formatCurrency(phaseTotal)}`
  })

  return [
    ...phaseLines,
    `Retenedor: ${formatCurrency(state.values.retainerPrice)}`,
    `Total: ${formatCurrency(total)}`,
  ].join(' · ')
}

export type {
  AlignerTreatmentMode,
  ConventionalBracketType,
  OrthodonticTreatmentType,
}
