import type { BudgetLineItem, BudgetSummary, TreatmentPlanItem } from '@/types/clinicalRecord'
import type { DentalImplantsBudget, OrthodonticsBudget } from '@/types/clinicalRecord'
import { normalizeCupsCode } from '@/services/catalogService'
import { normalizeQuantityForCups } from '@/utils/cupsBillingRules'
import { generateId } from '@/utils/crypto'
import { formatAnatomicalZone } from '@/utils/treatmentPlanZone'
import { calcClinicalBudgetSummaryWithTax } from '@/utils/budget'

const DEFAULT_PHASE = 'fase_ii' as const

export interface UnifiedProcedureRow {
  key: string
  planItemId?: string
  budgetItemId?: string
  /** Líneas de presupuesto que repiten este mismo procedimiento y no se muestran. */
  collapsedBudgetIds: string[]
  item: TreatmentPlanItem
}

function zoneKey(
  item: Parameters<typeof formatAnatomicalZone>[0],
): string {
  return formatAnatomicalZone(item).trim().toLowerCase()
}

function cupsKey(code?: string): string {
  const text = code?.trim()
  if (!text || !/\d/.test(text)) return ''
  return normalizeCupsCode(text)
}

function procedureKey(name?: string): string {
  return (name ?? '').trim().toLowerCase()
}

function planSignature(item: TreatmentPlanItem): string {
  return [
    item.procedure.trim(),
    cupsKey(item.cupsCode),
    zoneKey(item),
    normalizeQuantityForCups(item.cupsCode, item.quantity),
    Math.max(0, Math.round(item.unitPrice || 0)),
  ].join('|')
}

function sameProcedure(
  planItem: TreatmentPlanItem,
  line: BudgetLineItem,
): boolean {
  if (line.treatmentPlanItemId && line.treatmentPlanItemId !== planItem.id) return false
  if (!planItem.procedure.trim() || !line.procedure.trim()) return false
  const lineZone = zoneKey(line)
  const planZone = zoneKey(planItem)
  const cups = cupsKey(planItem.cupsCode)
  if (cups && cupsKey(line.cupsCode) === cups && lineZone === planZone) return true
  return procedureKey(line.procedure) === procedureKey(planItem.procedure) && lineZone === planZone
}

function overlayFinancials(
  planItem: TreatmentPlanItem,
  budget?: BudgetLineItem,
): TreatmentPlanItem {
  if (!budget) {
    return {
      ...planItem,
      quantity: normalizeQuantityForCups(planItem.cupsCode, planItem.quantity || 1),
    }
  }
  const unitPrice = budget.unitPrice > 0 ? budget.unitPrice : planItem.unitPrice
  return {
    ...planItem,
    quantity: normalizeQuantityForCups(
      planItem.cupsCode,
      budget.quantity > 0 ? budget.quantity : planItem.quantity || 1,
    ),
    unitPrice,
  }
}

function planItemFromBudgetLine(line: BudgetLineItem): TreatmentPlanItem {
  return {
    id: line.id,
    phase: DEFAULT_PHASE,
    procedure: line.procedure,
    cupsCode: line.cupsCode,
    toothNumber: line.toothNumber,
    fdiQuadrant: line.fdiQuadrant,
    arch: line.arch,
    anatomicalZone: formatAnatomicalZone(line),
    quantity: normalizeQuantityForCups(line.cupsCode, line.quantity || 1),
    unitPrice: Math.max(0, line.unitPrice || 0),
    patientApproved: 'pendiente',
    executionStatus: 'pendiente',
    source: 'manual',
  }
}

function budgetLineFromPlan(
  planItem: TreatmentPlanItem,
  budgetId: string,
  previous?: BudgetLineItem,
): BudgetLineItem {
  return {
    id: budgetId,
    treatmentPlanItemId: planItem.id,
    procedure: planItem.procedure,
    cupsCode: planItem.cupsCode,
    toothNumber: planItem.toothNumber,
    fdiQuadrant: planItem.fdiQuadrant,
    arch: planItem.arch,
    quantity: normalizeQuantityForCups(planItem.cupsCode, planItem.quantity || 1),
    unitPrice: Math.max(0, Math.round(planItem.unitPrice || 0)),
    source: previous?.source ?? 'treatment_plan',
  }
}

/** Filas visibles: un procedimiento del plan y su presupuesto, sin repetir coincidencias. */
export function buildUnifiedProcedureRows(
  treatmentPlan: TreatmentPlanItem[],
  budgetItems: BudgetLineItem[],
): UnifiedProcedureRow[] {
  const remaining = [...budgetItems]
  const rows: UnifiedProcedureRow[] = []

  const take = (predicate: (line: BudgetLineItem) => boolean): BudgetLineItem | undefined => {
    const index = remaining.findIndex(predicate)
    if (index < 0) return undefined
    const [line] = remaining.splice(index, 1)
    return line
  }

  const takeMatches = (planItem: TreatmentPlanItem): BudgetLineItem[] => {
    const matched: BudgetLineItem[] = []
    for (let index = remaining.length - 1; index >= 0; index -= 1) {
      const line = remaining[index]
      if (line.treatmentPlanItemId) continue
      if (!sameProcedure(planItem, line)) continue
      matched.unshift(remaining.splice(index, 1)[0])
    }
    return matched
  }

  for (const planItem of treatmentPlan) {
    const linked = take((line) => line.treatmentPlanItemId === planItem.id)
    let primary = linked
    let collapsed: BudgetLineItem[] = []
    if (!primary && planItem.procedure.trim()) {
      const matches = takeMatches(planItem)
      primary = matches[0]
      collapsed = matches.slice(1)
    } else if (primary && planItem.procedure.trim()) {
      collapsed = takeMatches(planItem)
    }

    rows.push({
      key: planItem.id,
      planItemId: planItem.id,
      budgetItemId: primary?.id,
      collapsedBudgetIds: collapsed.map((line) => line.id),
      item: overlayFinancials(planItem, primary),
    })
  }

  for (const line of remaining) {
    rows.push({
      key: line.id,
      budgetItemId: line.id,
      collapsedBudgetIds: [],
      item: planItemFromBudgetLine(line),
    })
  }

  return rows
}

/** Quita copias ocultas y crea la línea de presupuesto que falta en cada procedimiento del plan. */
export function persistVisibleBudgetLines(
  treatmentPlan: TreatmentPlanItem[],
  budgetItems: BudgetLineItem[],
): BudgetLineItem[] {
  const rows = buildUnifiedProcedureRows(treatmentPlan, budgetItems)
  const hidden = new Set(rows.flatMap((row) => row.collapsedBudgetIds))
  let items = budgetItems.filter((line) => !hidden.has(line.id))

  for (const row of rows) {
    if (!row.planItemId || !row.item.procedure.trim() || row.budgetItemId) continue
    items = [...items, budgetLineFromPlan({ ...row.item, id: row.planItemId }, generateId())]
  }

  return items
}

export function budgetSummaryForUnifiedRows(
  rows: UnifiedProcedureRow[],
  discount: number,
  orthodontics?: OrthodonticsBudget,
  dentalImplants?: DentalImplantsBudget,
): BudgetSummary {
  const lines: BudgetLineItem[] = rows
    .filter((row) => row.item.procedure.trim() || row.item.unitPrice > 0)
    .map((row) =>
      budgetLineFromPlan(row.item, row.budgetItemId ?? row.key),
    )
  return calcClinicalBudgetSummaryWithTax(lines, discount, orthodontics, dentalImplants)
}

export function commitUnifiedRowEdit(input: {
  treatmentPlan: TreatmentPlanItem[]
  budgetItems: BudgetLineItem[]
  rows: UnifiedProcedureRow[]
  editedKey: string
  patch: Partial<TreatmentPlanItem>
}): { treatmentPlan: TreatmentPlanItem[]; budgetItems: BudgetLineItem[] } {
  const row = input.rows.find((item) => item.key === input.editedKey)
  if (!row) {
    return { treatmentPlan: input.treatmentPlan, budgetItems: input.budgetItems }
  }

  const planId = row.planItemId ?? row.budgetItemId ?? generateId()
  const draft: TreatmentPlanItem = {
    ...row.item,
    ...input.patch,
    id: planId,
    quantity: normalizeQuantityForCups(
      input.patch.cupsCode ?? row.item.cupsCode,
      input.patch.quantity ?? row.item.quantity ?? 1,
    ),
    unitPrice: Math.max(0, Math.round(input.patch.unitPrice ?? row.item.unitPrice ?? 0)),
  }

  const treatmentPlan = row.planItemId
    ? input.treatmentPlan.map((item) => (item.id === planId ? { ...item, ...draft, id: planId } : item))
    : [...input.treatmentPlan, draft]

  const dropped = new Set(row.collapsedBudgetIds)
  let budgetItems = input.budgetItems.filter((line) => !dropped.has(line.id))

  if (!draft.procedure.trim()) {
    budgetItems = budgetItems.filter(
      (line) => line.id !== row.budgetItemId && line.treatmentPlanItemId !== planId,
    )
    return { treatmentPlan, budgetItems }
  }

  const existing =
    budgetItems.find((line) => line.id === row.budgetItemId) ??
    budgetItems.find((line) => line.treatmentPlanItemId === planId)
  const nextLine = budgetLineFromPlan(draft, existing?.id ?? generateId(), existing)
  budgetItems = existing
    ? budgetItems.map((line) => (line.id === existing.id ? nextLine : line))
    : [...budgetItems, nextLine]

  return { treatmentPlan, budgetItems }
}

export function removeUnifiedRow(input: {
  treatmentPlan: TreatmentPlanItem[]
  budgetItems: BudgetLineItem[]
  row: UnifiedProcedureRow
}): { treatmentPlan: TreatmentPlanItem[]; budgetItems: BudgetLineItem[] } {
  const dropped = new Set(
    [input.row.budgetItemId, ...input.row.collapsedBudgetIds].filter((id): id is string => Boolean(id)),
  )
  return {
    treatmentPlan: input.row.planItemId
      ? input.treatmentPlan.filter((item) => item.id !== input.row.planItemId)
      : input.treatmentPlan,
    budgetItems: input.budgetItems.filter((line) => {
      if (dropped.has(line.id)) return false
      if (input.row.planItemId && line.treatmentPlanItemId === input.row.planItemId) return false
      return true
    }),
  }
}

/**
 * Tras importar odontograma o anexos, actualiza las líneas vinculadas que cambiaron
 * y reutiliza una línea suelta equivalente en lugar de crear otra.
 */
export function reconcileBudgetAfterPlanChange(
  previousPlan: TreatmentPlanItem[],
  nextPlan: TreatmentPlanItem[],
  budgetItems: BudgetLineItem[],
): BudgetLineItem[] {
  const previousById = new Map(previousPlan.map((item) => [item.id, item]))
  const alivePlanIds = new Set(nextPlan.map((item) => item.id))
  const consumed = new Set<string>()
  const updates = new Map<string, BudgetLineItem>()
  const created: BudgetLineItem[] = []

  const unused = () => budgetItems.filter((line) => !consumed.has(line.id) && !updates.has(line.id))

  for (const planItem of nextPlan) {
    if (!planItem.procedure.trim()) continue
    const previous = previousById.get(planItem.id)
    const changed = !previous || planSignature(previous) !== planSignature(planItem)
    const linked = budgetItems.find(
      (line) => line.treatmentPlanItemId === planItem.id && !consumed.has(line.id),
    )

    if (!changed) {
      if (linked) consumed.add(linked.id)
      continue
    }

    const match =
      linked ??
      unused().find((line) => !line.treatmentPlanItemId && sameProcedure(planItem, line))
    if (match) {
      consumed.add(match.id)
      updates.set(match.id, budgetLineFromPlan(planItem, match.id, match))
      continue
    }

    created.push(budgetLineFromPlan(planItem, generateId()))
  }

  const kept = budgetItems.filter((line) => {
    if (updates.has(line.id)) return true
    if (line.treatmentPlanItemId && !alivePlanIds.has(line.treatmentPlanItemId)) return false
    return true
  })

  return [
    ...kept.map((line) => updates.get(line.id) ?? line),
    ...created,
  ]
}
