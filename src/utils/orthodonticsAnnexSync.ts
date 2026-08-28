import {
  calculateTotal,
  formatOrthodonticBudgetSummary,
  type OrthodonticBudgetState,
} from '@/components/clinical/orthodontics/calculator/types'
import type {
  ClinicalRecordFormData,
  OrthodonticsBudget,
  PaymentPlanItem,
  TreatmentPlanItem,
} from '@/types/clinicalRecord'
import type { OrthodonticsAnnex } from '@/types/specializedAnnexes'
import {
  formatOrthodonticTreatmentDurationMonths,
  formatOrthodonticTreatmentPlan,
} from '@/types/orthodonticsAnnex'
import {
  calcBudgetSummary,
  createEmptyOrthodonticsBudget,
  syncPaymentPlanWithBudget,
} from './budget'
import { generateId } from './crypto'

const SYNC_NOTES_START = '--- Plan de ortodoncia (anexo) ---'
const SYNC_NOTES_END = '--- Fin plan de ortodoncia ---'

function removeSyncedNotesBlock(notes: string): string {
  const start = notes.indexOf(SYNC_NOTES_START)
  if (start === -1) return notes.trim()

  const end = notes.indexOf(SYNC_NOTES_END, start)
  if (end === -1) {
    return notes.slice(0, start).trim()
  }

  return (notes.slice(0, start) + notes.slice(end + SYNC_NOTES_END.length)).trim()
}

export function buildOrthodonticsAnnexTreatmentPlanNotes(orthodontics: OrthodonticsAnnex): string {
  if (!orthodontics.treatmentType) return ''

  const lines = [
    formatOrthodonticTreatmentPlan({
      treatmentType: orthodontics.treatmentType,
      conventionalBracketType: orthodontics.conventionalBracketType,
      alignerTreatmentMode: orthodontics.alignerTreatmentMode,
      alignerPhaseCount: orthodontics.alignerPhaseCount,
      maxillaryOrthopedicsAppliance: orthodontics.maxillaryOrthopedicsAppliance,
    }),
    orthodontics.treatmentDurationMonths
      ? `Duración: ${formatOrthodonticTreatmentDurationMonths(orthodontics.treatmentDurationMonths)}`
      : '',
    orthodontics.orthodonticBudget
      ? `Presupuesto: ${formatOrthodonticBudgetSummary(orthodontics.orthodonticBudget)}`
      : '',
    orthodontics.notes.trim() ? `Observaciones del anexo: ${orthodontics.notes.trim()}` : '',
  ].filter(Boolean)

  if (lines.length === 0) return ''

  return `${SYNC_NOTES_START}\n${lines.join('\n')}\n${SYNC_NOTES_END}`
}

export function mapAnnexBudgetToClinicalBudget(
  orthodontics: OrthodonticsAnnex,
): OrthodonticsBudget {
  const empty = createEmptyOrthodonticsBudget()
  const annexBudget = orthodontics.orthodonticBudget

  if (!orthodontics.treatmentType || !annexBudget) {
    return { ...empty, active: false }
  }

  if (annexBudget.kind === 'standard') {
    const values = annexBudget.values
    const hasValues =
      values.initialPayment > 0 ||
      values.monthlyControlsCount > 0 ||
      values.pricePerControl > 0 ||
      values.retainerPrice > 0

    return {
      active: hasValues,
      initialInstallment: { quantity: 1, unitPrice: values.initialPayment },
      controls: {
        quantity: values.monthlyControlsCount,
        unitPrice: values.pricePerControl,
      },
      retainers: { quantity: 1, unitPrice: values.retainerPrice },
    }
  }

  return mapMultiPhaseAnnexBudgetToClinical(annexBudget)
}

function mapMultiPhaseAnnexBudgetToClinical(
  annexBudget: Extract<OrthodonticBudgetState, { kind: 'multi_phase' }>,
): OrthodonticsBudget {
  const phases = annexBudget.values.phases
  const initialTotal = phases.reduce((sum, phase) => sum + phase.initialPayment, 0)
  const controlsCount = phases.reduce((sum, phase) => sum + phase.monthlyControlsCount, 0)
  const controlsTotal = phases.reduce(
    (sum, phase) => sum + phase.monthlyControlsCount * phase.pricePerControl,
    0,
  )
  const hasValues =
    initialTotal > 0 || controlsTotal > 0 || annexBudget.values.retainerPrice > 0

  return {
    active: hasValues,
    initialInstallment: { quantity: 1, unitPrice: initialTotal },
    controls: {
      quantity: controlsCount,
      unitPrice: controlsCount > 0 ? controlsTotal / controlsCount : 0,
    },
    retainers: { quantity: 1, unitPrice: annexBudget.values.retainerPrice },
  }
}

function syncOrthodonticsTreatmentPlanItem(
  items: TreatmentPlanItem[],
  orthodontics: OrthodonticsAnnex,
): TreatmentPlanItem[] {
  const withoutAnnex = items.filter((item) => item.source !== 'orthodontics_annex')
  if (!orthodontics.treatmentType) return withoutAnnex

  const procedure =
    formatOrthodonticTreatmentPlan({
      treatmentType: orthodontics.treatmentType,
      conventionalBracketType: orthodontics.conventionalBracketType,
      alignerTreatmentMode: orthodontics.alignerTreatmentMode,
      alignerPhaseCount: orthodontics.alignerPhaseCount,
      maxillaryOrthopedicsAppliance: orthodontics.maxillaryOrthopedicsAppliance,
    }) || 'Tratamiento de ortodoncia'

  const existing = items.find((item) => item.source === 'orthodontics_annex')
  const total = orthodontics.orthodonticBudget
    ? calculateTotal(orthodontics.orthodonticBudget)
    : 0

  const syncedItem: TreatmentPlanItem = {
    id: existing?.id ?? generateId(),
    phase: existing?.phase ?? 'fase_ii',
    procedure,
    quantity: 1,
    unitPrice: total,
    patientApproved: existing?.patientApproved ?? 'pendiente',
    executionStatus: existing?.executionStatus ?? 'pendiente',
    notes: orthodontics.treatmentDurationMonths
      ? `Duración estimada: ${orthodontics.treatmentDurationMonths} meses`
      : existing?.notes,
    source: 'orthodontics_annex',
  }

  return [...withoutAnnex, syncedItem]
}

function enrichOrthodonticsPaymentPlan(
  paymentPlan: PaymentPlanItem[],
  orthodontics: OrthodonticsAnnex,
): PaymentPlanItem[] {
  const installments = orthodontics.treatmentDurationMonths ?? undefined

  return paymentPlan.map((item) => {
    if (item.procedure !== 'Ortodoncia — Controles') return item

    const installmentAmount =
      installments && installments > 0
        ? Math.round((item.totalAmount / installments) * 100) / 100
        : item.installmentAmount

    return {
      ...item,
      paymentMethod: installments && installments > 1 ? 'cuotas' : item.paymentMethod,
      installments: installments && installments > 0 ? installments : item.installments,
      installmentAmount,
    }
  })
}

export function syncClinicalDataFromOrthodonticsAnnex(
  data: ClinicalRecordFormData,
): ClinicalRecordFormData {
  const orthodontics = data.specializedAnnexes?.orthodontics
  const budgetSummary = data.budget ?? { subtotal: 0, discount: 0, total: 0, currency: 'COP' as const }
  const syncedNotesBlock = buildOrthodonticsAnnexTreatmentPlanNotes(orthodontics)
  const treatmentPlanNotes = syncedNotesBlock
    ? [removeSyncedNotesBlock(data.treatmentPlanNotes ?? ''), syncedNotesBlock]
        .filter(Boolean)
        .join('\n\n')
    : removeSyncedNotesBlock(data.treatmentPlanNotes ?? '')

  const orthodonticsBudget = mapAnnexBudgetToClinicalBudget(orthodontics)
  const treatmentPlan = syncOrthodonticsTreatmentPlanItem(data.treatmentPlan ?? [], orthodontics)
  const budget = calcBudgetSummary(
    data.budgetItems ?? [],
    budgetSummary.discount,
    orthodonticsBudget,
    data.dentalImplantsBudget,
  )
  const paymentPlan = enrichOrthodonticsPaymentPlan(
    syncPaymentPlanWithBudget(
      data.budgetItems ?? [],
      data.paymentPlan ?? [],
      orthodonticsBudget,
      data.dentalImplantsBudget,
    ),
    orthodontics,
  )

  return {
    ...data,
    treatmentPlan,
    treatmentPlanNotes,
    orthodonticsBudget,
    budget,
    paymentPlan,
  }
}
