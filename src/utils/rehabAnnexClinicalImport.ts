import type { AnnexProcedureBudgetLine } from '../types/annexProcedureBudget.ts'
import type { BudgetLineItem, BudgetSummary, TreatmentPlanItem } from '../types/clinicalRecord.ts'
import { generateId } from './crypto.ts'
import {
  collapseTreatmentPlanByProcedure,
  treatmentProcedureFamilyKey,
} from './treatmentPlanCollapse.ts'

const LEGACY_PIEZA_PROCEDURE_RE = /\s*[—–-]\s*pieza\s+\d{1,2}\s*$/i

/** Filas legacy diente-a-diente del presupuesto de rehabilitación: no deben pasar al plan. */
export function isLegacyPerToothRehabBudgetLine(
  line: Pick<AnnexProcedureBudgetLine, 'procedure' | 'importKey'>,
): boolean {
  if (line.importKey?.startsWith('visual:')) return true
  return LEGACY_PIEZA_PROCEDURE_RE.test(line.procedure ?? '')
}

/**
 * De la caja de rehab solo pasan filas agrupadas (summary/prosthesis/whitening/manual).
 * Si solo quedan `visual:` legacy, las agrupa por tipo de tratamiento.
 */
export function collectGroupedRehabBudgetLines(
  lines: AnnexProcedureBudgetLine[] | undefined,
): AnnexProcedureBudgetLine[] {
  if (!Array.isArray(lines) || lines.length === 0) return []

  const kept = lines.filter((line) => !isLegacyPerToothRehabBudgetLine(line) && line.procedure?.trim())
  if (kept.length > 0) return kept

  const byTreatment = new Map<
    string,
    {
      teeth: string[]
      unitPrice: number
      procedure: string
      cupsCode?: string
      sample: AnnexProcedureBudgetLine
    }
  >()

  for (const line of lines) {
    if (!isLegacyPerToothRehabBudgetLine(line)) continue
    const keyMatch = line.importKey?.match(/^visual:\d{1,2}:(.+)$/)
    const treatmentId = keyMatch?.[1] ?? treatmentProcedureFamilyKey(line.procedure)
    const tooth =
      (line.toothNumber && String(line.toothNumber)) ||
      line.anatomicalZone?.trim() ||
      line.importKey?.match(/^visual:(\d{1,2}):/)?.[1]
    const current = byTreatment.get(treatmentId) ?? {
      teeth: [],
      unitPrice: 0,
      procedure: line.procedure.replace(LEGACY_PIEZA_PROCEDURE_RE, '').trim() || line.procedure,
      cupsCode: line.cupsCode,
      sample: line,
    }
    if (tooth) current.teeth.push(tooth)
    current.unitPrice = Math.max(current.unitPrice, line.unitPrice ?? 0)
    if (!current.cupsCode && line.cupsCode) current.cupsCode = line.cupsCode
    byTreatment.set(treatmentId, current)
  }

  return [...byTreatment.entries()].map(([treatmentId, group]) => {
    const sorted = [...new Set(group.teeth)].sort((a, b) => Number(a) - Number(b))
    return {
      ...group.sample,
      id: group.sample.id || generateId(),
      procedure: group.procedure,
      cupsCode: group.cupsCode,
      toothNumber: sorted.length === 1 ? Number(sorted[0]) : undefined,
      anatomicalZone: sorted.join(', ') || group.sample.anatomicalZone,
      quantity: Math.max(1, sorted.length),
      unitPrice: group.unitPrice,
      source: 'import' as const,
      importKey: treatmentId.startsWith('summary:') ? treatmentId : `summary:${treatmentId}`,
    }
  })
}

/**
 * Inserta lo elegido del picker: si hay filas de rehabilitación, reemplaza las
 * antiguas (incl. legacy «— pieza N») por las de la caja resumida.
 */
export function mergeAnnexImportsIntoTreatmentPlan(
  plan: TreatmentPlanItem[],
  chosen: TreatmentPlanItem[],
): TreatmentPlanItem[] {
  if (chosen.length === 0) return collapseTreatmentPlanByProcedure(plan)

  const hasRehab = chosen.some((item) => item.source === 'rehabilitation_annex')
  const base = hasRehab
    ? plan.filter(
        (item) =>
          item.source !== 'rehabilitation_annex' &&
          !LEGACY_PIEZA_PROCEDURE_RE.test(item.procedure ?? ''),
      )
    : plan

  return collapseTreatmentPlanByProcedure([...base, ...chosen])
}

function isRehabPlanItem(item: Pick<TreatmentPlanItem, 'procedure' | 'source'>): boolean {
  if (item.source === 'rehabilitation_annex') return true
  return treatmentProcedureFamilyKey(item.procedure ?? '').startsWith('rehab:')
}

/**
 * Copia al presupuesto general (§8) las filas agrupadas de rehabilitación del plan.
 * Quita duplicados legacy diente-a-diente y cualquier línea de la misma familia.
 */
export function syncRehabPlanItemsIntoGeneralBudget(
  treatmentPlan: TreatmentPlanItem[],
  budgetItems: BudgetLineItem[],
  calcBudget: (items: BudgetLineItem[]) => BudgetSummary,
): { budgetItems: BudgetLineItem[]; budget: BudgetSummary } {
  const rehabPlanItems = treatmentPlan.filter(
    (item) => item.procedure.trim() && isRehabPlanItem(item),
  )
  const rehabFamilies = new Set(
    rehabPlanItems.map((item) => treatmentProcedureFamilyKey(item.procedure)),
  )

  const withoutRehab = budgetItems.filter((item) => {
    if (item.source === 'rehabilitation_annex') return false
    const family = treatmentProcedureFamilyKey(item.procedure ?? '')
    if (rehabFamilies.has(family)) return false
    if (LEGACY_PIEZA_PROCEDURE_RE.test(item.procedure ?? '') && family.startsWith('rehab:')) {
      return false
    }
    return true
  })

  const rehabLines: BudgetLineItem[] = rehabPlanItems.map((item) => ({
    id: item.id,
    treatmentPlanItemId: item.id,
    procedure: item.procedure,
    cupsCode: item.cupsCode,
    toothNumber: item.toothNumber,
    fdiQuadrant: item.fdiQuadrant,
    arch: item.arch,
    anatomicalZone: item.anatomicalZone,
    diagnosisCode: item.diagnosisCode,
    diagnosisDescription: item.diagnosisDescription,
    quantity: Math.max(1, item.quantity ?? 1),
    unitPrice: Math.max(0, Math.round(item.unitPrice ?? 0)),
    source: 'rehabilitation_annex' as const,
  }))

  const nextItems = [...withoutRehab, ...rehabLines]
  return {
    budgetItems: nextItems,
    budget: calcBudget(nextItems),
  }
}
