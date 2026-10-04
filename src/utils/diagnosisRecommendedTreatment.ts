import type {
  BudgetLineItem,
  Cie10Diagnosis,
  ClinicalRecordFormData,
  DiagnosisRecommendedTreatment,
  TreatmentPlanItem,
} from '@/types/clinicalRecord'
import { normalizeCupsCode } from '@/services/catalogService'
import { useTariffStore } from '@/store/useTariffStore'
import { treatmentPlanItemToBudgetLine, calcClinicalBudgetSummaryWithTax } from './budget'
import { generateId } from './crypto'
import { getDefaultQuantityForCups, normalizeQuantityForCups } from './cupsBillingRules'
import { resolveTariffUnitPrice } from './tariffLookup'

const DEFAULT_TREATMENT_PHASE = 'fase_ii' as const

export function procedureCodeKey(code: string | undefined): string {
  const trimmed = code?.trim() ?? ''
  if (!trimmed) return ''
  if (/^CUSTOM_/i.test(trimmed)) return trimmed.toUpperCase()
  if (/\d/.test(trimmed)) return normalizeCupsCode(trimmed)
  return trimmed.toUpperCase()
}

/** Precio del tarifario del usuario, con el mismo orden que el plan de tratamiento. */
export function resolveRecommendedTreatmentUnitPrice(cupsCode?: string): number {
  const code = cupsCode?.trim() ?? ''
  if (!code) return 0
  const { tariffMap } = useTariffStore.getState()
  return tariffMap[code]?.price ?? tariffMap[code.toUpperCase()]?.price ?? resolveTariffUnitPrice(code)
}

function diagnosisSlots(diagnosis: Cie10Diagnosis): Array<number | undefined> {
  const teeth = [...new Set(diagnosis.affectedTeeth ?? [])].sort((a, b) => a - b)
  return teeth.length > 0 ? teeth : [undefined]
}

function matchesTreatmentSlot(
  item: TreatmentPlanItem,
  diagnosisCode: string,
  cupsCode: string,
  toothNumber: number | undefined,
): boolean {
  if (item.diagnosisCode !== diagnosisCode) return false
  if (procedureCodeKey(item.cupsCode) !== procedureCodeKey(cupsCode)) return false
  return (item.toothNumber ?? undefined) === toothNumber
}

export function isRecommendedTreatmentInPlanAndBudget(
  diagnosis: Cie10Diagnosis,
  recommendation: DiagnosisRecommendedTreatment,
  treatmentPlan: TreatmentPlanItem[],
  budgetItems: BudgetLineItem[],
): boolean {
  return diagnosisSlots(diagnosis).every((toothNumber) => {
    const planItem = treatmentPlan.find((item) =>
      matchesTreatmentSlot(item, diagnosis.code, recommendation.cupsCode, toothNumber),
    )
    if (!planItem?.procedure.trim()) return false
    return budgetItems.some((line) => line.treatmentPlanItemId === planItem.id)
  })
}

export interface TransferRecommendedTreatmentResult {
  treatmentPlan: TreatmentPlanItem[]
  budgetItems: BudgetLineItem[]
  recommendation: DiagnosisRecommendedTreatment
}

/**
 * Copia un tratamiento recomendado al plan y al presupuesto.
 * Una línea por pieza FDI; si el diagnóstico no tiene pieza, una sola línea.
 * Omite la combinación CIE-10 + CUPS + pieza que ya exista y completa el presupuesto si falta.
 */
export function transferRecommendedTreatment(input: {
  diagnosis: Cie10Diagnosis
  recommendation: DiagnosisRecommendedTreatment
  treatmentPlan: TreatmentPlanItem[]
  budgetItems: BudgetLineItem[]
  unitPrice?: number
}): TransferRecommendedTreatmentResult {
  const { diagnosis, recommendation } = input
  const treatmentPlan = [...input.treatmentPlan]
  const budgetItems = [...input.budgetItems]
  const transferredIds = new Set(recommendation.transferredPlanItemIds ?? [])
  const unitPrice =
    input.unitPrice != null && input.unitPrice > 0
      ? input.unitPrice
      : resolveRecommendedTreatmentUnitPrice(recommendation.cupsCode)

  for (const toothNumber of diagnosisSlots(diagnosis)) {
    let planItem = treatmentPlan.find((item) =>
      matchesTreatmentSlot(item, diagnosis.code, recommendation.cupsCode, toothNumber),
    )

    if (!planItem) {
      planItem = {
        id: generateId(),
        phase: DEFAULT_TREATMENT_PHASE,
        procedure: recommendation.procedure.trim(),
        cupsCode: recommendation.cupsCode.trim(),
        toothNumber,
        quantity: normalizeQuantityForCups(
          recommendation.cupsCode,
          getDefaultQuantityForCups(recommendation.cupsCode),
        ),
        unitPrice,
        patientApproved: 'pendiente',
        executionStatus: 'pendiente',
        source: 'diagnostico',
        diagnosisCode: diagnosis.code,
        diagnosisDescription: diagnosis.description,
      }
      treatmentPlan.push(planItem)
    } else if (!planItem.procedure.trim() || (unitPrice > 0 && !(planItem.unitPrice > 0))) {
      const index = treatmentPlan.findIndex((item) => item.id === planItem!.id)
      planItem = {
        ...planItem,
        procedure: planItem.procedure.trim() || recommendation.procedure.trim(),
        cupsCode: planItem.cupsCode?.trim() || recommendation.cupsCode.trim(),
        unitPrice: planItem.unitPrice > 0 ? planItem.unitPrice : unitPrice,
        diagnosisDescription: planItem.diagnosisDescription || diagnosis.description,
      }
      if (index >= 0) treatmentPlan[index] = planItem
    }

    transferredIds.add(planItem.id)

    if (!budgetItems.some((line) => line.treatmentPlanItemId === planItem.id)) {
      const line = treatmentPlanItemToBudgetLine(planItem)
      if (line) budgetItems.push(line)
    }
  }

  return {
    treatmentPlan,
    budgetItems,
    recommendation: {
      ...recommendation,
      transferredPlanItemIds: [...transferredIds],
    },
  }
}

/** Aplica la transferencia sobre la historia y recalcula el total del presupuesto. */
export function applyRecommendedTreatmentTransfer(
  data: Pick<
    ClinicalRecordFormData,
    | 'diagnoses'
    | 'treatmentPlan'
    | 'budgetItems'
    | 'budget'
    | 'orthodonticsBudget'
    | 'dentalImplantsBudget'
  >,
  diagnosisCode: string,
  recommendationId: string,
): Partial<ClinicalRecordFormData> | null {
  const diagnosis = data.diagnoses.find((item) => item.code === diagnosisCode)
  const recommendation = diagnosis?.recommendedTreatments?.find((item) => item.id === recommendationId)
  if (!diagnosis || !recommendation || !recommendation.procedure.trim() || !recommendation.cupsCode.trim()) {
    return null
  }

  const transferred = transferRecommendedTreatment({
    diagnosis,
    recommendation,
    treatmentPlan: data.treatmentPlan,
    budgetItems: data.budgetItems,
  })

  return {
    diagnoses: data.diagnoses.map((item) =>
      item.code === diagnosisCode
        ? {
            ...item,
            recommendedTreatments: (item.recommendedTreatments ?? []).map((current) =>
              current.id === recommendationId ? transferred.recommendation : current,
            ),
          }
        : item,
    ),
    treatmentPlan: transferred.treatmentPlan,
    budgetItems: transferred.budgetItems,
    budget: calcClinicalBudgetSummaryWithTax(
      transferred.budgetItems,
      data.budget.discount,
      data.orthodonticsBudget,
      data.dentalImplantsBudget,
    ),
  }
}
