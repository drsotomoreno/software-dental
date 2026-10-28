import type {
  BudgetLineItem,
  ClinicalRecordFormData,
  PaymentPlanItem,
  TreatmentPhase,
  TreatmentPlanItem,
} from '@/types/clinicalRecord'
import {
  annexProcedureLineSubtotal,
  type AnnexProcedureBudget,
} from '@/types/annexProcedureBudget'
import type { RehabilitationAestheticsAnnex } from '@/types/rehabilitationAestheticsAnnex'
import { formatRehabBudgetSummary } from '@/types/rehabilitationAestheticsAnnex'
import { calcBudgetSummary, syncPaymentPlanWithBudget } from './budget'
import { generateId } from './crypto'

const SYNC_NOTES_START = '--- Plan de rehabilitación estética (anexo) ---'
const SYNC_NOTES_END = '--- Fin plan de rehabilitación estética ---'
const REHAB_TREATMENT_PHASE: TreatmentPhase = 'fase_iii'
export const REHABILITATION_ANNEX_SOURCE = 'rehabilitation_annex' as const

function removeSyncedNotesBlock(notes: string): string {
  const start = notes.indexOf(SYNC_NOTES_START)
  if (start === -1) return notes.trim()

  const end = notes.indexOf(SYNC_NOTES_END, start)
  if (end === -1) {
    return notes.slice(0, start).trim()
  }

  return (notes.slice(0, start) + notes.slice(end + SYNC_NOTES_END.length)).trim()
}

export function buildRehabilitationAnnexTreatmentPlanNotes(
  rehabilitation: RehabilitationAestheticsAnnex,
): string {
  const budget = rehabilitation.budget
  if (!budget?.active || budget.lines.length === 0) return ''

  const summary = formatRehabBudgetSummary(budget)
  const lines = [
    summary ? `Presupuesto: ${summary}` : '',
    rehabilitation.notes.trim()
      ? `Observaciones del anexo: ${rehabilitation.notes.trim()}`
      : '',
  ].filter(Boolean)

  if (lines.length === 0) return ''
  return `${SYNC_NOTES_START}\n${lines.join('\n')}\n${SYNC_NOTES_END}`
}

function activeBudgetLines(budget: AnnexProcedureBudget | undefined) {
  if (!budget?.active) return []
  return budget.lines.filter((line) => line.procedure.trim())
}

function syncRehabilitationTreatmentPlanItems(
  items: TreatmentPlanItem[],
  rehabilitation: RehabilitationAestheticsAnnex,
): TreatmentPlanItem[] {
  const withoutAnnex = items.filter((item) => item.source !== REHABILITATION_ANNEX_SOURCE)
  const lines = activeBudgetLines(rehabilitation.budget)

  const synced = lines.map((line) => {
    const existing = items.find(
      (item) =>
        item.source === REHABILITATION_ANNEX_SOURCE &&
        (item.id === line.id ||
          (line.importKey &&
            item.notes?.includes(`importKey:${line.importKey}`)) ||
          (item.procedure === line.procedure &&
            (item.toothNumber ?? 0) === (line.toothNumber ?? 0) &&
            (item.cupsCode ?? '') === (line.cupsCode ?? ''))),
    )

    return {
      id: existing?.id ?? line.id,
      phase: existing?.phase ?? REHAB_TREATMENT_PHASE,
      procedure: line.procedure,
      cupsCode: line.cupsCode,
      toothNumber: line.toothNumber,
      anatomicalZone: line.anatomicalZone,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      patientApproved: existing?.patientApproved ?? ('pendiente' as const),
      executionStatus: existing?.executionStatus ?? ('pendiente' as const),
      notes: line.importKey ? `importKey:${line.importKey}` : existing?.notes,
      source: REHABILITATION_ANNEX_SOURCE,
    }
  })

  return [...withoutAnnex, ...synced]
}

function syncRehabilitationBudgetItems(
  items: BudgetLineItem[],
  treatmentPlan: TreatmentPlanItem[],
  rehabilitation: RehabilitationAestheticsAnnex,
): BudgetLineItem[] {
  const withoutAnnex = items.filter((item) => item.source !== REHABILITATION_ANNEX_SOURCE)
  const lines = activeBudgetLines(rehabilitation.budget)

  const synced = lines.map((line) => {
    const planItem = treatmentPlan.find(
      (item) =>
        item.source === REHABILITATION_ANNEX_SOURCE &&
        (item.id === line.id ||
          (item.procedure === line.procedure &&
            (item.toothNumber ?? 0) === (line.toothNumber ?? 0) &&
            (item.cupsCode ?? '') === (line.cupsCode ?? ''))),
    )
    const existing = items.find(
      (item) => item.source === REHABILITATION_ANNEX_SOURCE && item.id === line.id,
    )

    return {
      id: existing?.id ?? line.id,
      treatmentPlanItemId: planItem?.id ?? existing?.treatmentPlanItemId,
      procedure: line.procedure,
      cupsCode: line.cupsCode,
      toothNumber: line.toothNumber,
      anatomicalZone: line.anatomicalZone,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      source: REHABILITATION_ANNEX_SOURCE,
    }
  })

  return [...withoutAnnex, ...synced]
}

function enrichRehabilitationPaymentPlan(
  paymentPlan: PaymentPlanItem[],
  rehabilitation: RehabilitationAestheticsAnnex,
): PaymentPlanItem[] {
  const lines = activeBudgetLines(rehabilitation.budget)
  if (lines.length === 0) return paymentPlan

  const byBudgetId = new Map(lines.map((line) => [line.id, line]))

  return paymentPlan.map((item) => {
    if (!item.budgetItemId) return item
    const annexLine = byBudgetId.get(item.budgetItemId)
    if (!annexLine) return item

    return {
      ...item,
      procedure: annexLine.procedure,
      cupsCode: annexLine.cupsCode,
      totalAmount: annexProcedureLineSubtotal(annexLine),
      paymentMethod: annexLine.paymentMethod,
      installments: annexLine.installments,
      initialPayment: annexLine.initialPayment,
      installmentAmount: annexLine.installmentAmount,
      dueDate: annexLine.dueDate,
      scheduleNotes: annexLine.scheduleNotes ?? '',
    }
  })
}

export function syncClinicalDataFromRehabilitationAnnex(
  data: ClinicalRecordFormData,
): ClinicalRecordFormData {
  const rehabilitation = data.specializedAnnexes?.rehabilitationAesthetics
  if (!rehabilitation) return data

  const budgetSummary = data.budget ?? {
    subtotal: 0,
    discount: 0,
    total: 0,
    currency: 'COP' as const,
  }
  const syncedNotesBlock = buildRehabilitationAnnexTreatmentPlanNotes(rehabilitation)
  const treatmentPlanNotes = syncedNotesBlock
    ? [removeSyncedNotesBlock(data.treatmentPlanNotes ?? ''), syncedNotesBlock]
        .filter(Boolean)
        .join('\n\n')
    : removeSyncedNotesBlock(data.treatmentPlanNotes ?? '')

  const treatmentPlan = syncRehabilitationTreatmentPlanItems(
    data.treatmentPlan ?? [],
    rehabilitation,
  )
  const budgetItems = syncRehabilitationBudgetItems(
    data.budgetItems ?? [],
    treatmentPlan,
    rehabilitation,
  )
  const budget = calcBudgetSummary(
    budgetItems,
    budgetSummary.discount,
    data.orthodonticsBudget,
    data.dentalImplantsBudget,
  )
  let paymentPlan = syncPaymentPlanWithBudget(
    budgetItems,
    data.paymentPlan ?? [],
    data.orthodonticsBudget,
    data.dentalImplantsBudget,
  )
  paymentPlan = enrichRehabilitationPaymentPlan(paymentPlan, rehabilitation)

  return {
    ...data,
    treatmentPlan,
    treatmentPlanNotes,
    budgetItems,
    budget,
    paymentPlan,
  }
}

/** Utilidad exportada para pruebas / reutilización. */
export function createRehabilitationBudgetLineId(): string {
  return generateId()
}
