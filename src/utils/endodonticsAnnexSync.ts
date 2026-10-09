import type {
  BudgetLineItem,
  ClinicalRecordFormData,
  TreatmentPhase,
  TreatmentPlanItem,
} from '@/types/clinicalRecord'
import type { EndodonticsAnnex } from '@/types/specializedAnnexes'
import { calcBudgetSummary, syncPaymentPlanWithBudget } from './budget'
import {
  formatEndoProcedureLabel,
  formatEndodonticBudgetSummary,
} from './endoAnnex'
import { generateId } from './crypto'
import { isSameTreatment } from './treatmentIdentity'

const SYNC_NOTES_START = '--- Plan de endodoncia (anexo) ---'
const SYNC_NOTES_END = '--- Fin plan de endodoncia ---'

const ENDO_CUPS_CODE = '997401'
const ENDO_TREATMENT_PHASE: TreatmentPhase = 'fase_iii'

function removeSyncedNotesBlock(notes: string): string {
  const start = notes.indexOf(SYNC_NOTES_START)
  if (start === -1) return notes.trim()

  const end = notes.indexOf(SYNC_NOTES_END, start)
  if (end === -1) {
    return notes.slice(0, start).trim()
  }

  return (notes.slice(0, start) + notes.slice(end + SYNC_NOTES_END.length)).trim()
}

export function buildEndodonticsAnnexTreatmentPlanNotes(endodontics: EndodonticsAnnex): string {
  const budget = endodontics.budget
  if (!budget?.active || budget.toothLines.length === 0) return ''

  const lines = [
    formatEndodonticBudgetSummary(budget, endodontics.isRetreatment),
    budget.notes.trim() ? `Observaciones del presupuesto: ${budget.notes.trim()}` : '',
    endodontics.notes.trim() ? `Observaciones del anexo: ${endodontics.notes.trim()}` : '',
  ].filter(Boolean)

  if (lines.length === 0) return ''

  return `${SYNC_NOTES_START}\n${lines.join('\n')}\n${SYNC_NOTES_END}`
}

function syncEndodonticsTreatmentPlanItems(
  items: TreatmentPlanItem[],
  endodontics: EndodonticsAnnex,
): TreatmentPlanItem[] {
  const withoutAnnex = items.filter((item) => item.source !== 'endodontics_annex')
  const budget = endodontics.budget
  if (!budget?.active) return withoutAnnex

  const synced = budget.toothLines
    .filter((line) => line.toothNumber > 0 && line.unitPrice > 0)
    .map((line) => {
      const procedure = formatEndoProcedureLabel(line.toothNumber, endodontics.isRetreatment)
      const existing = items.find(
        (item) =>
          item.source === 'endodontics_annex' && item.toothNumber === line.toothNumber,
      )

      return {
        id: existing?.id ?? generateId(),
        phase: existing?.phase ?? ENDO_TREATMENT_PHASE,
        procedure,
        cupsCode: ENDO_CUPS_CODE,
        toothNumber: line.toothNumber,
        quantity: 1,
        unitPrice: line.unitPrice,
        patientApproved: existing?.patientApproved ?? 'pendiente',
        executionStatus: existing?.executionStatus ?? 'pendiente',
        notes: budget.notes || existing?.notes,
        source: 'endodontics_annex' as const,
      }
    })

  return [...withoutAnnex, ...synced]
}

function syncEndodonticsBudgetItems(
  items: BudgetLineItem[],
  treatmentPlan: TreatmentPlanItem[],
  endodontics: EndodonticsAnnex,
): BudgetLineItem[] {
  const withoutAnnex = items.filter((item) => item.source !== 'endodontics_annex')
  const budget = endodontics.budget
  if (!budget?.active) return withoutAnnex

  const consumedIds = new Set<string>()
  const synced = budget.toothLines
    .filter((line) => line.toothNumber > 0 && line.unitPrice > 0)
    .map((line) => {
      const procedure = formatEndoProcedureLabel(line.toothNumber, endodontics.isRetreatment)
      const identity = {
        procedure,
        cupsCode: ENDO_CUPS_CODE,
        toothNumber: line.toothNumber,
      }
      const planItem = treatmentPlan.find(
        (item) =>
          item.source === 'endodontics_annex' && item.toothNumber === line.toothNumber,
      )
      const annexExisting = items.find(
        (item) =>
          item.source === 'endodontics_annex' && item.toothNumber === line.toothNumber,
      )
      const clinicalExisting = withoutAnnex.find(
        (item) => !consumedIds.has(item.id) && isSameTreatment(item, identity),
      )
      if (clinicalExisting) consumedIds.add(clinicalExisting.id)
      const existing = annexExisting ?? clinicalExisting

      return {
        id: existing?.id ?? generateId(),
        treatmentPlanItemId: planItem?.id ?? existing?.treatmentPlanItemId,
        procedure,
        cupsCode: ENDO_CUPS_CODE,
        toothNumber: line.toothNumber,
        quantity: 1,
        unitPrice: line.unitPrice,
        source: 'endodontics_annex' as const,
      }
    })

  return [...withoutAnnex.filter((item) => !consumedIds.has(item.id)), ...synced]
}

export function syncClinicalDataFromEndodonticsAnnex(
  data: ClinicalRecordFormData,
): ClinicalRecordFormData {
  const endodontics = data.specializedAnnexes?.endodontics
  const budgetSummary = data.budget ?? { subtotal: 0, discount: 0, total: 0, currency: 'COP' as const }
  const syncedNotesBlock = buildEndodonticsAnnexTreatmentPlanNotes(endodontics)
  const treatmentPlanNotes = syncedNotesBlock
    ? [removeSyncedNotesBlock(data.treatmentPlanNotes ?? ''), syncedNotesBlock]
        .filter(Boolean)
        .join('\n\n')
    : removeSyncedNotesBlock(data.treatmentPlanNotes ?? '')

  const treatmentPlan = syncEndodonticsTreatmentPlanItems(data.treatmentPlan ?? [], endodontics)
  const budgetItems = syncEndodonticsBudgetItems(
    data.budgetItems ?? [],
    treatmentPlan,
    endodontics,
  )
  const budget = calcBudgetSummary(
    budgetItems,
    budgetSummary.discount,
    data.orthodonticsBudget,
    data.dentalImplantsBudget,
  )
  const paymentPlan = syncPaymentPlanWithBudget(
    budgetItems,
    data.paymentPlan ?? [],
    data.orthodonticsBudget,
    data.dentalImplantsBudget,
  )

  return {
    ...data,
    treatmentPlan,
    treatmentPlanNotes,
    budgetItems,
    budget,
    paymentPlan,
  }
}
