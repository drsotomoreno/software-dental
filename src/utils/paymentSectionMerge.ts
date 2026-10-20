import type {
  BudgetLineItem,
  DentalImplantsBudget,
  OrthodonticsBudget,
  PaymentControlLine,
  PaymentPlanItem,
  TreatmentPlanItem,
} from '@/types/clinicalRecord'
import {
  DENTAL_IMPLANT_PAYMENT_PLAN_PROCEDURES,
  ORTHODONTICS_PAYMENT_PLAN_PROCEDURES,
  syncPaymentPlanWithBudget,
} from '@/utils/budget'
import { generateId } from '@/utils/crypto'
import { importBudgetIntoPaymentControl, lineBillablePrice } from '@/utils/paymentControlLines'

export function isOrthodonticsPlanItem(item: Pick<PaymentPlanItem, 'procedure'>): boolean {
  return ORTHODONTICS_PAYMENT_PLAN_PROCEDURES.has(item.procedure)
}

export function isImplantPlanItem(item: Pick<PaymentPlanItem, 'procedure'>): boolean {
  return DENTAL_IMPLANT_PAYMENT_PLAN_PROCEDURES.has(item.procedure)
}

/** Acuerdo de pago que corresponde a una fila clínica, sin duplicar ortodoncia. */
export function planItemForLine(
  line: PaymentControlLine,
  plan: PaymentPlanItem[],
): PaymentPlanItem | undefined {
  const byLine = plan.find((item) => item.paymentControlLineId === line.id)
  if (byLine && !isOrthodonticsPlanItem(byLine)) return byLine
  if (line.budgetItemId) {
    const byBudget = plan.find(
      (item) => item.budgetItemId === line.budgetItemId && !isOrthodonticsPlanItem(item),
    )
    if (byBudget) return byBudget
  }
  const byImplantName = plan.find(
    (item) =>
      isImplantPlanItem(item) &&
      !item.paymentControlLineId &&
      !item.budgetItemId &&
      item.procedure === line.procedure,
  )
  return byImplantName
}

export function lineOwnsPlanItem(line: PaymentControlLine, item: PaymentPlanItem): boolean {
  return planItemForLine(line, [item])?.id === item.id
}

/** Acuerdos que todavía no están en la tabla (filas personalizadas antiguas). */
export function supplementalPlanItems(
  lines: PaymentControlLine[],
  plan: PaymentPlanItem[],
): PaymentPlanItem[] {
  return plan.filter(
    (item) => !isOrthodonticsPlanItem(item) && !lines.some((line) => lineOwnsPlanItem(line, item)),
  )
}

export function orthodonticsPlanItems(plan: PaymentPlanItem[]): PaymentPlanItem[] {
  return plan.filter(isOrthodonticsPlanItem)
}

export function controlLineFromPlanItem(item: PaymentPlanItem): PaymentControlLine {
  return {
    id: generateId(),
    procedure: item.procedure,
    cupsCode: item.cupsCode,
    quantity: 1,
    unitPrice: Math.max(0, item.totalAmount || 0),
    budgetItemId: item.budgetItemId,
    source: item.budgetItemId ? 'budget' : 'manual',
  }
}

export function createLinkedPlanItem(line: PaymentControlLine): PaymentPlanItem {
  return {
    id: generateId(),
    source: line.budgetItemId ? 'budget' : 'custom',
    budgetItemId: line.budgetItemId,
    paymentControlLineId: line.id,
    procedure: line.procedure,
    cupsCode: line.cupsCode,
    totalAmount: lineBillablePrice(line),
    paymentMethod: 'contado',
    scheduleNotes: '',
  }
}

export function upsertAgreement(
  line: PaymentControlLine,
  plan: PaymentPlanItem[],
  patch: Partial<PaymentPlanItem>,
): PaymentPlanItem[] {
  const existing = planItemForLine(line, plan)
  if (existing) {
    return plan.map((item) =>
      item.id === existing.id
        ? {
            ...item,
            ...patch,
            paymentControlLineId: line.id,
            budgetItemId: item.budgetItemId ?? line.budgetItemId,
            procedure: line.procedure || item.procedure,
            cupsCode: line.cupsCode ?? item.cupsCode,
            totalAmount: lineBillablePrice(line),
          }
        : item,
    )
  }

  return [
    ...plan,
    {
      ...createLinkedPlanItem(line),
      ...patch,
      procedure: line.procedure,
      cupsCode: line.cupsCode,
      totalAmount: lineBillablePrice(line),
    },
  ]
}

/** Mantiene procedimiento y valor del acuerdo alineados con la fila clínica. */
export function mirrorLineOntoPlan(
  line: PaymentControlLine,
  plan: PaymentPlanItem[],
): PaymentPlanItem[] {
  const existing = planItemForLine(line, plan)
  if (!existing) return plan
  const totalAmount = lineBillablePrice(line)
  if (
    existing.procedure === line.procedure &&
    existing.cupsCode === line.cupsCode &&
    existing.totalAmount === totalAmount &&
    existing.paymentControlLineId === line.id
  ) {
    return plan
  }

  return plan.map((item) =>
    item.id === existing.id
      ? {
          ...item,
          procedure: line.procedure,
          cupsCode: line.cupsCode,
          totalAmount,
          paymentControlLineId: line.id,
          budgetItemId: item.budgetItemId ?? line.budgetItemId,
        }
      : item,
  )
}

export function removePlanItemsForLine(
  line: PaymentControlLine,
  plan: PaymentPlanItem[],
): PaymentPlanItem[] {
  return plan.filter((item) => !lineOwnsPlanItem(line, item))
}

function linkPlanItemsToLines(
  lines: PaymentControlLine[],
  plan: PaymentPlanItem[],
): PaymentPlanItem[] {
  return plan.map((item) => {
    if (item.paymentControlLineId || isOrthodonticsPlanItem(item) || !item.budgetItemId) return item
    const line = lines.find((row) => row.budgetItemId === item.budgetItemId)
    return line ? { ...item, paymentControlLineId: line.id } : item
  })
}

function promoteImplantPlanItems(
  lines: PaymentControlLine[],
  plan: PaymentPlanItem[],
): { lines: PaymentControlLine[]; plan: PaymentPlanItem[] } {
  let nextLines = lines
  let nextPlan = plan

  for (const item of plan.filter(isImplantPlanItem)) {
    if (nextLines.some((line) => lineOwnsPlanItem(line, item))) continue
    const line = controlLineFromPlanItem(item)
    nextLines = [...nextLines, line]
    nextPlan = nextPlan.map((row) =>
      row.id === item.id ? { ...row, paymentControlLineId: line.id } : row,
    )
  }

  return { lines: nextLines, plan: nextPlan }
}

/**
 * Una sola importación: filas clínicas desde el presupuesto y acuerdos
 * (incluido ortodoncia e implantes) sin repetir procedimientos.
 */
export function importBudgetIntoPaymentSection(input: {
  budgetItems: BudgetLineItem[]
  treatmentPlan: TreatmentPlanItem[]
  lines: PaymentControlLine[]
  plan: PaymentPlanItem[]
  orthodonticsBudget?: OrthodonticsBudget
  dentalImplantsBudget?: DentalImplantsBudget
}): { lines: PaymentControlLine[]; plan: PaymentPlanItem[] } {
  const importedLines = importBudgetIntoPaymentControl(
    input.budgetItems,
    input.treatmentPlan,
    input.lines,
  )
  const syncedPlan = syncPaymentPlanWithBudget(
    input.budgetItems,
    input.plan,
    input.orthodonticsBudget,
    input.dentalImplantsBudget,
  )
  const linked = linkPlanItemsToLines(importedLines, syncedPlan)
  return promoteImplantPlanItems(importedLines, linked)
}
