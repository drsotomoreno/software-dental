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

function sameZone(left?: string, right?: string): boolean {
  return (left ?? '').trim().toLowerCase() === (right ?? '').trim().toLowerCase()
}

/**
 * Busca la fila del presupuesto §8 ya vinculada a un ítem del plan de rehab.
 * Prioriza `treatmentPlanItemId` para conservar ediciones de procedimiento/CUPS
 * aunque el usuario haya cambiado el nombre (y con ello la familia).
 */
function findExistingRehabBudgetLine(
  item: TreatmentPlanItem,
  candidates: BudgetLineItem[],
  usedIds: Set<string>,
): BudgetLineItem | undefined {
  const byPlanId = candidates.find(
    (line) =>
      !usedIds.has(line.id) &&
      (line.treatmentPlanItemId === item.id || line.id === item.id),
  )
  if (byPlanId) return byPlanId

  const family = treatmentProcedureFamilyKey(item.procedure)
  return candidates.find((line) => {
    if (usedIds.has(line.id)) return false
    if (treatmentProcedureFamilyKey(line.procedure ?? '') !== family) return false
    if (line.anatomicalZone || item.anatomicalZone) {
      return sameZone(line.anatomicalZone, item.anatomicalZone)
    }
    return true
  })
}

/**
 * Copia al presupuesto general (§8) las filas agrupadas de rehabilitación del plan.
 * Quita duplicados legacy diente-a-diente y cualquier línea de la misma familia.
 * Conserva procedimiento, CUPS y precio ya editados en §8 (el plan solo aporta
 * la selección inicial / zona / cantidad).
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

  const existingRehabCandidates = budgetItems.filter((item) => {
    if (item.source === 'rehabilitation_annex') return true
    const family = treatmentProcedureFamilyKey(item.procedure ?? '')
    if (rehabFamilies.has(family)) return true
    if (LEGACY_PIEZA_PROCEDURE_RE.test(item.procedure ?? '') && family.startsWith('rehab:')) {
      return true
    }
    return false
  })

  const withoutRehab = budgetItems.filter(
    (item) => !existingRehabCandidates.some((rehab) => rehab.id === item.id),
  )

  const usedExistingIds = new Set<string>()
  const rehabLines: BudgetLineItem[] = rehabPlanItems.map((item) => {
    const existing = findExistingRehabBudgetLine(item, existingRehabCandidates, usedExistingIds)
    if (existing) usedExistingIds.add(existing.id)

    const planPrice = Math.max(0, Math.round(item.unitPrice ?? 0))
    const existingPrice = Math.max(0, Math.round(existing?.unitPrice ?? 0))

    return {
      id: existing?.id ?? item.id,
      treatmentPlanItemId: item.id,
      // Edición libre en §8: no pisar nombre ni CUPS ya capturados en presupuesto.
      procedure: (existing?.procedure ?? '').trim() || item.procedure,
      cupsCode: (existing?.cupsCode ?? '').trim() || item.cupsCode,
      toothNumber: item.toothNumber,
      fdiQuadrant: item.fdiQuadrant,
      arch: item.arch,
      anatomicalZone: item.anatomicalZone,
      diagnosisCode: item.diagnosisCode ?? existing?.diagnosisCode,
      diagnosisDescription: item.diagnosisDescription ?? existing?.diagnosisDescription,
      quantity: Math.max(1, item.quantity ?? existing?.quantity ?? 1),
      unitPrice: existingPrice > 0 ? existingPrice : planPrice,
      source: 'rehabilitation_annex' as const,
    }
  })

  const nextItems = [...withoutRehab, ...rehabLines]
  return {
    budgetItems: nextItems,
    budget: calcBudget(nextItems),
  }
}
