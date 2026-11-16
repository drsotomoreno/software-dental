/**
 * Presupuesto general (budgetItems / budget): evidencia médico-legal del plan
 * aceptado. Un autoguardado o sync incompleto NUNCA puede dejarlo en blanco
 * si otra copia del mismo paciente ya lo tenía.
 */

import { dedupeClinicalItems } from './clinicalListMerge.js'

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function text(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function lineRichness(item) {
  if (!item || typeof item !== 'object') return 0
  let score = 0
  if (text(item.procedure)) score += 3
  if (text(item.cupsCode)) score += 2
  if (text(item.diagnosisCode)) score += 1
  if (Number(item.unitPrice) > 0) score += 1
  if (Number(item.quantity) > 0) score += 1
  if (text(item.tooth) || text(item.zone) || text(item.anatomicalZone)) score += 1
  return score
}

function budgetItemsRichness(items) {
  return asArray(items).reduce((sum, item) => sum + lineRichness(item), 0)
}

function budgetSummaryTotal(budget) {
  if (!budget || typeof budget !== 'object') return 0
  const total = Number(budget.total)
  if (Number.isFinite(total) && total > 0) return total
  const subtotal = Number(budget.subtotal)
  return Number.isFinite(subtotal) && subtotal > 0 ? subtotal : 0
}

export function generalBudgetHasContent(form) {
  if (!form || typeof form !== 'object') return false
  if (asArray(form.budgetItems).some((item) => text(item?.procedure))) return true
  return budgetSummaryTotal(form.budget) > 0
}

function budgetFingerprint(item) {
  return [
    text(item.procedure).toLowerCase(),
    String(item.toothNumber ?? item.tooth ?? item.anatomicalZone ?? ''),
    String(item.unitPrice ?? ''),
    text(item.cupsCode),
    String(item.quantity ?? ''),
  ].join('|')
}

function preferBudgetLine(previous, incoming) {
  if (!previous) return incoming
  if (!incoming) return previous
  if (lineRichness(incoming) >= lineRichness(previous)) return { ...previous, ...incoming }
  return { ...incoming, ...previous }
}

/** Une líneas por id. Sin id, usa procedimiento + diente + precio. Un duplicado exacto no se repite. */
export function mergeBudgetItems(left, right) {
  return dedupeClinicalItems([...asArray(left), ...asArray(right)], {
    fingerprint: budgetFingerprint,
    prefer: preferBudgetLine,
  }).filter((item) => text(item.procedure) || lineRichness(item) > 0)
}

export function preferBudgetSummary(existing, incoming) {
  const prevTotal = budgetSummaryTotal(existing)
  const nextTotal = budgetSummaryTotal(incoming)
  if (nextTotal === 0 && prevTotal > 0) return existing
  if (incoming && typeof incoming === 'object') return incoming
  return existing ?? null
}

/**
 * Autoguardado: si la copia entrante vacía el presupuesto general y la
 * guardada sí lo tenía, conserva la guardada.
 */
export function preferGeneralBudgetSections(existing, incoming) {
  const left = existing && typeof existing === 'object' ? existing : {}
  const right = incoming && typeof incoming === 'object' ? incoming : {}
  const prevRich = budgetItemsRichness(left.budgetItems)
  const nextRich = budgetItemsRichness(right.budgetItems)

  return {
    budgetItems:
      nextRich === 0 && prevRich > 0
        ? asArray(left.budgetItems)
        : nextRich > 0 && prevRich > 0
          ? mergeBudgetItems(left.budgetItems, right.budgetItems)
          : asArray(right.budgetItems?.length ? right.budgetItems : left.budgetItems),
    budget: preferBudgetSummary(left.budget, right.budget),
  }
}

export function mergeClinicalBudgetSections(base, incoming) {
  const left = base && typeof base === 'object' ? base : {}
  const right = incoming && typeof incoming === 'object' ? incoming : {}
  const mergedItems = mergeBudgetItems(left.budgetItems, right.budgetItems)
  const richerSummary =
    budgetSummaryTotal(right.budget) >= budgetSummaryTotal(left.budget)
      ? right.budget ?? left.budget
      : left.budget ?? right.budget
  return {
    budgetItems: mergedItems,
    budget:
      budgetSummaryTotal(richerSummary) > 0 || mergedItems.length === 0
        ? richerSummary ?? null
        : left.budget ?? right.budget ?? null,
  }
}

function mergeNestedBudgetForm(winnerForm, otherForm) {
  if (!winnerForm || typeof winnerForm !== 'object') return winnerForm ?? null
  return {
    ...winnerForm,
    ...mergeClinicalBudgetSections(otherForm, winnerForm),
  }
}

/**
 * Aplica la unión de presupuesto general sobre el documento ganador.
 * Usado junto con la unión de pagos en pull/push y autoguardado.
 */
export function withMergedClinicalBudgets(winner, other) {
  if (!winner || typeof winner !== 'object') return winner
  const otherRecord = other && typeof other === 'object' ? other : {}

  if ('clinicalDraft' in winner || 'valuationDraft' in winner) {
    return {
      ...winner,
      clinicalDraft: mergeNestedBudgetForm(winner.clinicalDraft, otherRecord.clinicalDraft),
      valuationDraft: mergeNestedBudgetForm(winner.valuationDraft, otherRecord.valuationDraft),
    }
  }

  return {
    ...winner,
    ...mergeClinicalBudgetSections(otherRecord, winner),
  }
}
