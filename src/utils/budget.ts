import type {
  BudgetLineItem,
  BudgetSummary,
  DentalImplantsBudget,
  DentalImplantsBudgetLine,
  OrthodonticsBudget,
  OrthodonticsBudgetLine,
  TreatmentPlanItem,
} from '@/types/clinicalRecord'
import type { PaymentPlanItem } from '@/types/clinicalRecord'
import { DEFAULT_IVA_RATE } from '@/types/pricing'
import { generateId } from './crypto'
import { calcBillableLineTotal, normalizeQuantityForCups } from './cupsBillingRules'
import { resolveTariffUnitPrice } from './tariffLookup'
import { canonicalCupsCode, findDuplicateTreatment, isSameTreatment } from './treatmentIdentity'

export function createEmptyOrthodonticsBudget(): OrthodonticsBudget {
  return {
    active: false,
    initialInstallment: { quantity: 1, unitPrice: 0 },
    controls: { quantity: 0, unitPrice: 0 },
    retainers: { quantity: 0, unitPrice: 0 },
  }
}

export function createEmptyDentalImplantsBudget(): DentalImplantsBudget {
  return {
    active: false,
    implantPlacement: { quantity: 0, unitPrice: 0 },
    prosthetics: { quantity: 0, unitPrice: 0 },
  }
}

export function normalizeOrthodonticsBudget(
  data?: Partial<OrthodonticsBudget>,
): OrthodonticsBudget {
  const base = createEmptyOrthodonticsBudget()
  if (!data) return base
  return {
    active: data.active ?? false,
    initialInstallment: {
      quantity: data.initialInstallment?.quantity ?? 1,
      unitPrice: data.initialInstallment?.unitPrice ?? 0,
    },
    controls: {
      quantity: data.controls?.quantity ?? 0,
      unitPrice: data.controls?.unitPrice ?? 0,
    },
    retainers: {
      quantity: data.retainers?.quantity ?? 0,
      unitPrice: data.retainers?.unitPrice ?? 0,
    },
  }
}

export function normalizeDentalImplantsBudget(
  data?: Partial<DentalImplantsBudget>,
): DentalImplantsBudget {
  const base = createEmptyDentalImplantsBudget()
  if (!data) return base
  return {
    active: data.active ?? false,
    implantPlacement: {
      quantity: data.implantPlacement?.quantity ?? 0,
      unitPrice: data.implantPlacement?.unitPrice ?? 0,
    },
    prosthetics: {
      quantity: data.prosthetics?.quantity ?? 0,
      unitPrice: data.prosthetics?.unitPrice ?? 0,
    },
  }
}

export function lineSubtotal(line: OrthodonticsBudgetLine | DentalImplantsBudgetLine): number {
  return Math.max(0, line.quantity) * Math.max(0, line.unitPrice)
}

export function calcOrthodonticsBudgetTotal(orthodontics?: OrthodonticsBudget): number {
  if (!orthodontics?.active) return 0
  return (
    lineSubtotal(orthodontics.initialInstallment) +
    lineSubtotal(orthodontics.controls) +
    lineSubtotal(orthodontics.retainers)
  )
}

export function calcDentalImplantsBudgetTotal(dentalImplants?: DentalImplantsBudget): number {
  if (!dentalImplants?.active) return 0
  return (
    lineSubtotal(dentalImplants.implantPlacement) +
    lineSubtotal(dentalImplants.prosthetics)
  )
}

export function calcSpecialtyBudgetTotal(
  orthodontics?: OrthodonticsBudget,
  dentalImplants?: DentalImplantsBudget,
): number {
  return calcOrthodonticsBudgetTotal(orthodontics) + calcDentalImplantsBudgetTotal(dentalImplants)
}

export function calcBudgetSummary(
  items: BudgetLineItem[],
  discount: number,
  orthodontics?: OrthodonticsBudget,
  dentalImplants?: DentalImplantsBudget,
): { subtotal: number; discount: number; total: number; currency: 'COP' } {
  const itemsSubtotal = items.reduce(
    (sum, i) => sum + calcBillableLineTotal(i.unitPrice, i.quantity, i.cupsCode),
    0,
  )
  const specialtySubtotal = calcSpecialtyBudgetTotal(orthodontics, dentalImplants)
  const subtotal = itemsSubtotal + specialtySubtotal
  const total = Math.max(0, subtotal - discount)
  return { subtotal, discount, total, currency: 'COP' }
}

/** Convierte un ítem del plan en línea de presupuesto con precio del tarifario. */
export function treatmentPlanItemToBudgetLine(item: TreatmentPlanItem): BudgetLineItem | null {
  if (!item.procedure.trim()) return null

  const catalogPrice = resolveTariffUnitPrice(item.cupsCode)
  const unitPrice = item.unitPrice != null && item.unitPrice > 0 ? item.unitPrice : catalogPrice

  return {
    id: generateId(),
    treatmentPlanItemId: item.id,
    procedure: item.procedure,
    cupsCode: item.cupsCode,
    toothNumber: item.toothNumber,
    fdiQuadrant: item.fdiQuadrant,
    arch: item.arch,
    quantity: normalizeQuantityForCups(item.cupsCode, item.quantity),
    unitPrice,
    source: 'treatment_plan',
  }
}

/** Agrega un procedimiento del plan al presupuesto si aún no está vinculado. */
export function addTreatmentPlanItemToBudget(
  planItem: TreatmentPlanItem,
  existingItems: BudgetLineItem[] = [],
): BudgetLineItem[] | null {
  if (!planItem.procedure.trim() && !planItem.cupsCode?.trim()) return null
  if (existingItems.some((line) => line.treatmentPlanItemId === planItem.id)) {
    return null
  }

  const duplicate = findDuplicateTreatment(existingItems, planItem)
  if (duplicate) {
    if (!duplicate.treatmentPlanItemId) {
      return existingItems.map((line) =>
        line.id === duplicate.id ? { ...line, treatmentPlanItemId: planItem.id } : line,
      )
    }
    return null
  }

  const line = treatmentPlanItemToBudgetLine(planItem)
  if (!line) return null

  return [...existingItems, line]
}

export interface BudgetImportResult {
  items: BudgetLineItem[]
  skippedDuplicates: number
}

export function calcClinicalBudgetSummaryWithTax(
  items: BudgetLineItem[],
  discount: number,
  orthodontics?: OrthodonticsBudget,
  dentalImplants?: DentalImplantsBudget,
  taxRate = DEFAULT_IVA_RATE,
): BudgetSummary {
  const base = calcBudgetSummary(items, discount, orthodontics, dentalImplants)
  const taxableBase = Math.max(0, base.subtotal - base.discount)
  const total = taxableBase + Math.round(taxableBase * taxRate)

  return {
    subtotal: base.subtotal,
    discount: base.discount,
    total,
    currency: 'COP',
  }
}

/**
 * Convierte procedimientos del plan clínico en líneas de presupuesto.
 * No vuelve a cargar un tratamiento ya vinculado o repetido (mismo CUPS o nombre y misma zona).
 */
export function importTreatmentPlanIntoBudget(
  treatmentPlan: TreatmentPlanItem[],
  existingItems: BudgetLineItem[] = [],
): BudgetImportResult {
  let next = existingItems
  let changed = false
  let skippedDuplicates = 0

  for (const item of treatmentPlan) {
    if (!item.procedure.trim() && !item.cupsCode?.trim()) continue
    if (next.some((line) => line.treatmentPlanItemId === item.id)) {
      skippedDuplicates += 1
      continue
    }

    const duplicate = findDuplicateTreatment(next, item)
    if (duplicate) {
      skippedDuplicates += 1
      if (!duplicate.treatmentPlanItemId) {
        changed = true
        next = next.map((line) =>
          line.id === duplicate.id ? { ...line, treatmentPlanItemId: item.id } : line,
        )
      }
      continue
    }

    const line = treatmentPlanItemToBudgetLine(item)
    if (!line) continue
    changed = true
    next = [...next, line]
  }

  return { items: changed ? next : existingItems, skippedDuplicates }
}

/** Convierte procedimientos del plan clínico en líneas de presupuesto con precio del tarifario. */
export function buildBudgetFromTreatmentPlan(
  treatmentPlan: TreatmentPlanItem[],
  existingItems: BudgetLineItem[] = [],
): BudgetLineItem[] {
  return importTreatmentPlanIntoBudget(treatmentPlan, existingItems).items
}

/** Conceptos de ortodoncia que el plan de pagos mantiene aparte del listado clínico. */
export const ORTHODONTICS_PAYMENT_PLAN_PROCEDURES = new Set([
  'Ortodoncia — Cuota inicial',
  'Ortodoncia — Controles',
  'Ortodoncia — Retenedores',
])

/** Conceptos de implantes que el plan de pagos sincroniza con el presupuesto. */
export const DENTAL_IMPLANT_PAYMENT_PLAN_PROCEDURES = new Set([
  'Implantes — Colocación',
  'Implantes — Prótesis definitiva',
])

/** Filas del plan de pagos derivadas del presupuesto de ortodoncia. */
export function orthodonticsPaymentPlanItems(
  orthodontics?: OrthodonticsBudget,
): PaymentPlanItem[] {
  if (!orthodontics?.active) return []

  const rows: { procedure: string; total: number }[] = [
    {
      procedure: 'Ortodoncia — Cuota inicial',
      total: lineSubtotal(orthodontics.initialInstallment),
    },
    {
      procedure: 'Ortodoncia — Controles',
      total: lineSubtotal(orthodontics.controls),
    },
    {
      procedure: 'Ortodoncia — Retenedores',
      total: lineSubtotal(orthodontics.retainers),
    },
  ]

  return rows
    .filter((row) => row.total > 0)
    .map((row) => ({
      id: generateId(),
      procedure: row.procedure,
      totalAmount: row.total,
      paymentMethod: 'contado' as const,
      scheduleNotes: '',
    }))
}

/** Filas del plan de pagos derivadas del presupuesto de implantes. */
export function dentalImplantsPaymentPlanItems(
  dentalImplants?: DentalImplantsBudget,
): PaymentPlanItem[] {
  if (!dentalImplants?.active) return []

  const rows: { procedure: string; total: number }[] = [
    {
      procedure: 'Implantes — Colocación',
      total: lineSubtotal(dentalImplants.implantPlacement),
    },
    {
      procedure: 'Implantes — Prótesis definitiva',
      total: lineSubtotal(dentalImplants.prosthetics),
    },
  ]

  return rows
    .filter((row) => row.total > 0)
    .map((row) => ({
      id: generateId(),
      procedure: row.procedure,
      totalAmount: row.total,
      paymentMethod: 'contado' as const,
      scheduleNotes: '',
    }))
}

function procedureMatchesBudget(plan: PaymentPlanItem, item: BudgetLineItem): boolean {
  const planName = plan.procedure.trim().toLowerCase()
  const itemName = item.procedure.trim().toLowerCase()
  if (!planName || planName !== itemName) return false
  const planCups = canonicalCupsCode(plan.cupsCode)
  const itemCups = canonicalCupsCode(item.cupsCode)
  if (planCups && itemCups && planCups !== itemCups) return false
  return true
}

/** Crea o actualiza filas del plan de pagos según el presupuesto. */
export function syncPaymentPlanWithBudget(
  budgetItems: BudgetLineItem[],
  current: PaymentPlanItem[],
  orthodontics?: OrthodonticsBudget,
  dentalImplants?: DentalImplantsBudget,
): PaymentPlanItem[] {
  const managedProcedureNames = new Set([
    ...ORTHODONTICS_PAYMENT_PLAN_PROCEDURES,
    ...DENTAL_IMPLANT_PAYMENT_PLAN_PROCEDURES,
  ])

  const manualRows = current.filter(
    (p) => !p.budgetItemId && !managedProcedureNames.has(p.procedure),
  )

  const byBudgetId = new Map(
    current.filter((p) => p.budgetItemId).map((p) => [p.budgetItemId!, p]),
  )

  const accepted: BudgetLineItem[] = []
  const consumedManualIds = new Set<string>()
  const fromItems: PaymentPlanItem[] = []

  for (const item of budgetItems) {
    if (!item.procedure.trim() && !item.cupsCode?.trim()) continue
    if (accepted.some((existing) => isSameTreatment(existing, item))) {
      const existingPlan = byBudgetId.get(item.id)
      if (existingPlan) {
        fromItems.push({
          ...existingPlan,
          procedure: item.procedure,
          cupsCode: item.cupsCode ?? existingPlan.cupsCode,
          totalAmount: item.quantity * item.unitPrice,
        })
      }
      continue
    }

    const totalAmount = item.quantity * item.unitPrice
    const existing = byBudgetId.get(item.id)
    if (existing) {
      accepted.push(item)
      fromItems.push({
        ...existing,
        procedure: item.procedure,
        cupsCode: item.cupsCode ?? existing.cupsCode,
        totalAmount,
      })
      continue
    }

    const specialtyExisting = current.find(
      (row) =>
        !row.budgetItemId &&
        !consumedManualIds.has(row.id) &&
        (ORTHODONTICS_PAYMENT_PLAN_PROCEDURES.has(row.procedure) ||
          DENTAL_IMPLANT_PAYMENT_PLAN_PROCEDURES.has(row.procedure)) &&
        row.procedure === item.procedure,
    )
    const manualExisting = current.find(
      (row) =>
        !row.budgetItemId &&
        !consumedManualIds.has(row.id) &&
        !managedProcedureNames.has(row.procedure) &&
        procedureMatchesBudget(row, item),
    )
    const reusable = specialtyExisting ?? manualExisting
    if (reusable) {
      consumedManualIds.add(reusable.id)
      accepted.push(item)
      fromItems.push({
        ...reusable,
        budgetItemId: item.id,
        source: 'budget',
        procedure: item.procedure,
        cupsCode: item.cupsCode ?? reusable.cupsCode,
        totalAmount,
      })
      continue
    }

    accepted.push(item)
    fromItems.push({
      id: generateId(),
      budgetItemId: item.id,
      source: 'budget' as const,
      procedure: item.procedure,
      cupsCode: item.cupsCode,
      totalAmount,
      paymentMethod: 'contado' as const,
      scheduleNotes: '',
    })
  }

  const existingOrtho = new Map(
    current
      .filter((p) => ORTHODONTICS_PAYMENT_PLAN_PROCEDURES.has(p.procedure))
      .map((p) => [p.procedure, p]),
  )

  const coveredProcedures = new Set(fromItems.map((item) => item.procedure))

  const orthoRows = orthodonticsPaymentPlanItems(orthodontics)
    .filter((row) => !coveredProcedures.has(row.procedure))
    .map((row) => {
      const existing = existingOrtho.get(row.procedure)
      return existing ? { ...existing, totalAmount: row.totalAmount } : row
    })

  const existingImplants = new Map(
    current
      .filter((p) => DENTAL_IMPLANT_PAYMENT_PLAN_PROCEDURES.has(p.procedure))
      .map((p) => [p.procedure, p]),
  )

  const implantRows = dentalImplantsPaymentPlanItems(dentalImplants)
    .filter((row) => !coveredProcedures.has(row.procedure))
    .map((row) => {
      const existing = existingImplants.get(row.procedure)
      return existing ? { ...existing, totalAmount: row.totalAmount } : row
    })

  const remainingManual = manualRows.filter((row) => !consumedManualIds.has(row.id))

  return [...fromItems, ...remainingManual, ...orthoRows, ...implantRows]
}

/** Migra registros antiguos que guardaban precios solo en treatmentPlan. */
export function migrateLegacyBudget(
  treatmentPlan: TreatmentPlanItem[],
  budgetItems: BudgetLineItem[] | undefined,
  budget: { subtotal: number; discount: number; total: number; currency: 'COP' },
  orthodonticsBudget?: OrthodonticsBudget,
  dentalImplantsBudget?: DentalImplantsBudget,
): {
  budgetItems: BudgetLineItem[]
  orthodonticsBudget: OrthodonticsBudget
  dentalImplantsBudget: DentalImplantsBudget
  budget: typeof budget
} {
  const ortho = normalizeOrthodonticsBudget(orthodonticsBudget)
  const implants = normalizeDentalImplantsBudget(dentalImplantsBudget)

  if (budgetItems && budgetItems.length > 0) {
    return {
      budgetItems,
      orthodonticsBudget: ortho,
      dentalImplantsBudget: implants,
      budget: calcBudgetSummary(budgetItems, budget.discount, ortho, implants),
    }
  }

  const fromPlan = treatmentPlan
    .filter((t) => (t.procedure ?? '').trim())
    .filter((t, index, all) => all.findIndex((other) => isSameTreatment(other, t)) === index)
    .map((t) => ({
      id: generateId(),
      treatmentPlanItemId: t.id,
      procedure: t.procedure,
      cupsCode: t.cupsCode,
      toothNumber: t.toothNumber,
      fdiQuadrant: t.fdiQuadrant,
      arch: t.arch,
      quantity: t.quantity,
      unitPrice: t.unitPrice ?? 0,
    }))

  if (fromPlan.length === 0) {
    return { budgetItems: [], orthodonticsBudget: ortho, dentalImplantsBudget: implants, budget }
  }

  return {
    budgetItems: fromPlan,
    orthodonticsBudget: ortho,
    dentalImplantsBudget: implants,
    budget: calcBudgetSummary(fromPlan, budget.discount, ortho, implants),
  }
}
