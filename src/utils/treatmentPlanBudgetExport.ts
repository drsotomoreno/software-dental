import type {
  BudgetLineItem,
  BudgetSummary,
  DentalImplantsBudget,
  OrthodonticsBudget,
  TreatmentPlanItem,
} from '../types/clinicalRecord.ts'
import { generateId } from './crypto.ts'
import { extractTeethFromZoneText } from './treatmentPlanCollapse.ts'
import {
  isOrthodonticsAnnexPlanItem,
  omitOrthodonticsPackageBudgetLines,
} from './orthodonticsBudgetLines.ts'

export interface PlanBudgetExportDeps {
  catalogPrice?: (cupsCode?: string) => number
  normalizeQuantity?: (cupsCode: string | undefined, quantity: number) => number
}

const defaultDeps: Required<PlanBudgetExportDeps> = {
  catalogPrice: () => 0,
  normalizeQuantity: (cupsCode, quantity) => {
    void cupsCode
    const parsed = Number.isFinite(quantity) ? Math.floor(quantity) : 1
    return Math.max(1, parsed)
  },
}

function depsOf(deps?: PlanBudgetExportDeps): Required<PlanBudgetExportDeps> {
  return {
    catalogPrice: deps?.catalogPrice ?? defaultDeps.catalogPrice,
    normalizeQuantity: deps?.normalizeQuantity ?? defaultDeps.normalizeQuantity,
  }
}

function planProcedure(item: Pick<TreatmentPlanItem, 'procedure'>): string {
  return (item.procedure ?? '').trim()
}

/** Misma lectura de zona que el plan, sin arrastrar el tarifario. */
function formatZone(
  item: Pick<TreatmentPlanItem, 'anatomicalZone' | 'toothNumber' | 'fdiQuadrant' | 'arch'>,
): string {
  const stored = item.anatomicalZone?.trim()
  if (stored) return stored
  if (Number.isInteger(item.toothNumber)) return String(item.toothNumber)
  if (item.fdiQuadrant) return item.fdiQuadrant
  if (item.arch === 'superior') return 'Arcada Superior'
  if (item.arch === 'inferior') return 'Arcada Inferior'
  return ''
}

/**
 * Nombre con el que la fila del plan entra al presupuesto.
 * Un diagnóstico importado puede tener precio y CIE sin procedimiento CUPS
 * (el campo muestra el placeholder). Esa fila igual debe exportarse.
 */
export function budgetLabelForTreatmentPlanItem(
  item: Pick<
    TreatmentPlanItem,
    | 'procedure'
    | 'diagnosisCode'
    | 'diagnosisDescription'
    | 'unitPrice'
    | 'anatomicalZone'
    | 'toothNumber'
    | 'fdiQuadrant'
    | 'arch'
  >,
): string {
  const procedure = planProcedure(item)
  if (procedure) return procedure

  const diagnosis = [item.diagnosisCode, item.diagnosisDescription]
    .map((part) => (part ?? '').trim())
    .filter(Boolean)
    .join(' ')
  if (diagnosis) return diagnosis

  if (Number(item.unitPrice) > 0) {
    const zone = formatZone(item)
    return zone ? `Procedimiento (${zone})` : 'Procedimiento'
  }

  return ''
}

function zoneToothCount(
  item: Pick<TreatmentPlanItem, 'anatomicalZone' | 'toothNumber' | 'fdiQuadrant' | 'arch'>,
): number {
  return extractTeethFromZoneText(formatZone(item) || item.anatomicalZone).length
}

function groupedZone(
  item: Pick<TreatmentPlanItem, 'anatomicalZone' | 'toothNumber' | 'fdiQuadrant' | 'arch'>,
): boolean {
  return zoneToothCount(item) > 1
}

/** Cantidad que el valor total del plan ya usa. No multiplicar por las piezas de la zona. */
function quantityForPlanExport(
  item: TreatmentPlanItem,
  normalizeQuantity: Required<PlanBudgetExportDeps>['normalizeQuantity'],
): number {
  const planQuantity = Math.max(1, Math.floor(Number(item.quantity) || 1))
  if (groupedZone(item)) return planQuantity
  return normalizeQuantity(item.cupsCode, planQuantity)
}

function sameText(left: string | undefined, right: string | undefined): boolean {
  return (left ?? '').trim().toLowerCase() === (right ?? '').trim().toLowerCase()
}

/** Convierte un ítem del plan en línea de presupuesto, conservando zona, CIE y precio. */
export function treatmentPlanItemToBudgetLine(
  item: TreatmentPlanItem,
  deps?: PlanBudgetExportDeps,
): BudgetLineItem | null {
  const procedure = budgetLabelForTreatmentPlanItem(item)
  if (!procedure) return null

  const { catalogPrice, normalizeQuantity } = depsOf(deps)
  const resolvedCatalog = catalogPrice(item.cupsCode)
  const unitPrice =
    item.unitPrice != null && Number.isFinite(item.unitPrice)
      ? Math.max(0, Math.round(item.unitPrice))
      : resolvedCatalog
  const zone = formatZone(item)
  const severalTeeth = groupedZone(item)

  return {
    id: generateId(),
    treatmentPlanItemId: item.id,
    procedure,
    cupsCode: item.cupsCode,
    toothNumber: severalTeeth ? undefined : item.toothNumber,
    fdiQuadrant: severalTeeth ? undefined : item.fdiQuadrant,
    arch: item.arch,
    anatomicalZone: zone || undefined,
    diagnosisCode: item.diagnosisCode,
    diagnosisDescription: item.diagnosisDescription,
    quantity: quantityForPlanExport(item, normalizeQuantity),
    unitPrice,
    source: item.source === 'rehabilitation_annex' ? 'rehabilitation_annex' : 'treatment_plan',
  }
}

function budgetLineMatchesPlanItem(line: BudgetLineItem, item: TreatmentPlanItem): boolean {
  if (line.treatmentPlanItemId && line.treatmentPlanItemId === item.id) return true
  if (line.treatmentPlanItemId && line.treatmentPlanItemId !== item.id) return false

  const label = budgetLabelForTreatmentPlanItem(item)
  const sameProcedure =
    sameText(line.procedure, item.procedure) || (Boolean(label) && sameText(line.procedure, label))
  if (!sameProcedure) return false

  const lineCups = (line.cupsCode ?? '').trim()
  const itemCups = (item.cupsCode ?? '').trim()
  if (lineCups && itemCups && lineCups !== itemCups) return false

  const lineZone = formatZone(line).trim().toLowerCase()
  const itemZone = formatZone(item).trim().toLowerCase()
  if (lineZone && itemZone) return lineZone === itemZone
  return !lineZone
}

/** Agrega un procedimiento del plan al presupuesto si aún no está vinculado. */
export function addTreatmentPlanItemToBudget(
  planItem: TreatmentPlanItem,
  existingItems: BudgetLineItem[] = [],
  deps?: PlanBudgetExportDeps,
): BudgetLineItem[] | null {
  if (isOrthodonticsAnnexPlanItem(planItem)) return null
  if (existingItems.some((line) => line.treatmentPlanItemId === planItem.id)) return null

  const line = treatmentPlanItemToBudgetLine(planItem, deps)
  if (!line) return null
  return [...existingItems, line]
}

/** Convierte procedimientos del plan clínico en líneas de presupuesto. */
export function buildBudgetFromTreatmentPlan(
  treatmentPlan: TreatmentPlanItem[],
  existingItems: BudgetLineItem[] = [],
  deps?: PlanBudgetExportDeps,
): BudgetLineItem[] {
  const resolved = depsOf(deps)
  const next = [...omitOrthodonticsPackageBudgetLines(existingItems, treatmentPlan)]
  const usedLineIds = new Set<string>()

  for (const item of treatmentPlan) {
    if (isOrthodonticsAnnexPlanItem(item) || !budgetLabelForTreatmentPlanItem(item)) continue

    const matchIndex = next.findIndex(
      (line) => !usedLineIds.has(line.id) && budgetLineMatchesPlanItem(line, item),
    )

    if (matchIndex >= 0) {
      const line = next[matchIndex]
      usedLineIds.add(line.id)
      const zone = formatZone(item)
      const label = budgetLabelForTreatmentPlanItem(item)
      const rehabLine =
        line.source === 'rehabilitation_annex' || item.source === 'rehabilitation_annex'
      const planPrice =
        item.unitPrice != null && Number.isFinite(item.unitPrice)
          ? Math.max(0, Math.round(item.unitPrice))
          : line.unitPrice
      const severalTeeth = groupedZone(item)
      next[matchIndex] = {
        ...line,
        treatmentPlanItemId: line.treatmentPlanItemId || item.id,
        procedure: rehabLine
          ? line.procedure.trim() || label
          : planProcedure(item) || line.procedure.trim() || label,
        cupsCode: (item.cupsCode ?? '').trim() || line.cupsCode,
        toothNumber: severalTeeth ? undefined : (item.toothNumber ?? line.toothNumber),
        fdiQuadrant: severalTeeth ? undefined : (item.fdiQuadrant ?? line.fdiQuadrant),
        arch: item.arch ?? line.arch,
        anatomicalZone: zone || line.anatomicalZone || undefined,
        diagnosisCode: item.diagnosisCode || line.diagnosisCode,
        diagnosisDescription: item.diagnosisDescription || line.diagnosisDescription,
        quantity: quantityForPlanExport(item, resolved.normalizeQuantity),
        source:
          item.source === 'rehabilitation_annex' || line.source === 'rehabilitation_annex'
            ? 'rehabilitation_annex'
            : (line.source ?? 'treatment_plan'),
        unitPrice: rehabLine && line.unitPrice > 0 ? line.unitPrice : planPrice,
      }
      continue
    }

    const line = treatmentPlanItemToBudgetLine(item, resolved)
    if (!line) continue
    usedLineIds.add(line.id)
    next.push(line)
  }

  return next
}

function money(quantity?: number, unitPrice?: number): number {
  return Math.max(0, Number(quantity) || 0) * Math.max(0, Number(unitPrice) || 0)
}

function simpleBudgetSummary(
  items: BudgetLineItem[],
  discount: number,
  orthodontics?: OrthodonticsBudget,
  dentalImplants?: DentalImplantsBudget,
): BudgetSummary {
  const itemsSubtotal = items.reduce((sum, item) => sum + money(item.quantity, item.unitPrice), 0)
  const ortho = orthodontics?.active
    ? money(orthodontics.initialInstallment?.quantity, orthodontics.initialInstallment?.unitPrice) +
      money(orthodontics.controls?.quantity, orthodontics.controls?.unitPrice) +
      money(orthodontics.retainers?.quantity, orthodontics.retainers?.unitPrice)
    : 0
  const implants = dentalImplants?.active
    ? money(dentalImplants.implantPlacement?.quantity, dentalImplants.implantPlacement?.unitPrice) +
      money(dentalImplants.prosthetics?.quantity, dentalImplants.prosthetics?.unitPrice)
    : 0
  const subtotal = itemsSubtotal + ortho + implants
  return {
    subtotal,
    discount,
    total: Math.max(0, subtotal - discount),
    currency: 'COP',
  }
}

type BudgetSummarizer = (
  items: BudgetLineItem[],
  discount: number,
  orthodontics?: OrthodonticsBudget,
  dentalImplants?: DentalImplantsBudget,
) => BudgetSummary

/** Copia el plan de tratamiento (sección 7) al presupuesto general (sección 8). */
export function syncTreatmentPlanIntoGeneralBudget(
  treatmentPlan: TreatmentPlanItem[],
  budgetItems: BudgetLineItem[],
  discount = 0,
  orthodontics?: OrthodonticsBudget,
  dentalImplants?: DentalImplantsBudget,
  deps?: PlanBudgetExportDeps,
  summarize: BudgetSummarizer = simpleBudgetSummary,
): { budgetItems: BudgetLineItem[]; budget: BudgetSummary } {
  const lines = buildBudgetFromTreatmentPlan(treatmentPlan, budgetItems, deps)
  return {
    budgetItems: lines,
    budget: summarize(lines, discount, orthodontics, dentalImplants),
  }
}

/** Texto del botón «Importar desde plan de tratamiento». */
export function treatmentPlanBudgetImportNotice(
  treatmentPlan: TreatmentPlanItem[],
  before: BudgetLineItem[],
  after: BudgetLineItem[],
): string {
  const beforeIds = new Set(before.map((item) => item.id))
  const added = after.filter((line) => !beforeIds.has(line.id)).length
  if (added > 0) {
    return `Se agregaron ${added} procedimiento${added === 1 ? '' : 's'} del plan de tratamiento.`
  }

  const exportable = treatmentPlan.some(
    (item) => !isOrthodonticsAnnexPlanItem(item) && Boolean(budgetLabelForTreatmentPlanItem(item)),
  )
  if (exportable) return 'Los procedimientos del plan ya están en el presupuesto.'
  if (treatmentPlan.some((item) => isOrthodonticsAnnexPlanItem(item))) {
    return 'El tratamiento de ortodoncia ya está en el presupuesto de ortodoncia.'
  }
  return 'No hay procedimientos del plan con diagnóstico, nombre o precio para importar.'
}
