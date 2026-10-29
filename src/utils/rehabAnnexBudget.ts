import {
  REHAB_PROTESIS_PARCIAL_REMOVIBLE_LABEL,
  REHAB_PROTESIS_TOTAL_LABEL,
  REHAB_TREATMENT_OPTIONS,
} from '@/components/clinical/rehabilitation/rehab-odontogram/constants'
import type { RehabTreatmentType } from '@/components/clinical/rehabilitation/rehab-odontogram/types'
import {
  REHAB_DENTAL_WHITENING_OPTIONS,
  type RehabDentalWhiteningPlan,
} from '@/constants/dentalWhitening'
import {
  formatRehabRestorationColor,
  mapRestorationMaterialToBudgetMaterial,
  type RehabRestorationDetails,
} from '@/constants/rehabilitationRestoration'
import {
  createBlankAnnexProcedureBudgetLine,
  normalizeAnnexProcedureBudget,
  type AnnexProcedureBudget,
  type AnnexProcedureBudgetLine,
} from '@/types/annexProcedureBudget'
import {
  formatRehabArchProsthesisScope,
  type RehabArchProsthesisPlan,
  type RehabilitationAestheticsAnnex,
} from '@/types/rehabilitationAestheticsAnnex'
import { generateId } from '@/utils/crypto'

function treatmentLabel(tratamiento: string): string {
  return REHAB_TREATMENT_OPTIONS.find((option) => option.id === tratamiento)?.label ?? tratamiento
}

function sortTeethIds(teeth: string[]): string[] {
  return teeth.slice().sort((a, b) => Number(a) - Number(b))
}

function procedureWithColor(
  baseLabel: string,
  restorationKey: keyof RehabRestorationDetails | undefined,
  restorationDetails: RehabRestorationDetails | undefined,
): string {
  if (!restorationKey || !restorationDetails) return baseLabel
  const color = restorationDetails[restorationKey]?.restorationColor
  if (!color) return baseLabel
  return `${baseLabel} (Color: ${formatRehabRestorationColor(color)})`
}

function budgetMaterialFromRestoration(
  restorationKey: keyof RehabRestorationDetails | undefined,
  restorationDetails: RehabRestorationDetails | undefined,
): string {
  if (!restorationKey || !restorationDetails) return ''
  return mapRestorationMaterialToBudgetMaterial(restorationDetails[restorationKey]?.material)
}

function prosthesisLine(
  kind: 'protesis_total' | 'protesis_parcial_removible',
  plan: RehabArchProsthesisPlan,
  restorationDetails?: RehabRestorationDetails,
): Omit<AnnexProcedureBudgetLine, 'id'> {
  const label =
    kind === 'protesis_total' ? REHAB_PROTESIS_TOTAL_LABEL : REHAB_PROTESIS_PARCIAL_REMOVIBLE_LABEL
  const restorationKey =
    kind === 'protesis_parcial_removible' ? 'protesis_parcial_removible' : undefined
  return {
    procedure: procedureWithColor(label, restorationKey, restorationDetails),
    material: budgetMaterialFromRestoration(restorationKey, restorationDetails),
    anatomicalZone:
      plan.scope === 'superior'
        ? 'Arcada Superior'
        : plan.scope === 'inferior'
          ? 'Arcada Inferior'
          : 'Superior e inferior',
    quantity: 1,
    unitPrice: 0,
    source: 'import',
    importKey: `prosthesis:${kind}:${plan.scope}`,
    paymentMethod: 'contado',
    scheduleNotes: '',
  }
}

/**
 * Agrupa el plan visual como el Resumen Tratamiento Restaurador:
 * una fila por tipo de tratamiento, con piezas y cantidad.
 */
function restorativeSummaryCandidates(
  annex: RehabilitationAestheticsAnnex,
): Array<Omit<AnnexProcedureBudgetLine, 'id'>> {
  const byTreatment = new Map<RehabTreatmentType, string[]>()

  for (const entry of annex.visualTreatmentPlan ?? []) {
    if (!entry.tratamiento) continue
    const teeth = byTreatment.get(entry.tratamiento) ?? []
    teeth.push(entry.dienteId)
    byTreatment.set(entry.tratamiento, teeth)
  }

  const candidates: Array<Omit<AnnexProcedureBudgetLine, 'id'>> = []

  for (const option of REHAB_TREATMENT_OPTIONS) {
    const teeth = byTreatment.get(option.id)
    if (!teeth?.length) continue
    const sorted = sortTeethIds(teeth)
    candidates.push({
      procedure: procedureWithColor(option.label, option.id, annex.restorationDetails),
      cupsCode: option.cupsCode,
      material: budgetMaterialFromRestoration(option.id, annex.restorationDetails),
      anatomicalZone: sorted.join(', '),
      quantity: sorted.length,
      unitPrice: 0,
      source: 'import',
      importKey: `summary:${option.id}`,
      paymentMethod: 'contado',
      scheduleNotes: '',
    })
  }

  if (annex.protesisTotal) {
    candidates.push(prosthesisLine('protesis_total', annex.protesisTotal, annex.restorationDetails))
  }
  if (annex.protesisParcialRemovible) {
    candidates.push(
      prosthesisLine(
        'protesis_parcial_removible',
        annex.protesisParcialRemovible,
        annex.restorationDetails,
      ),
    )
  }

  return candidates
}

function whiteningCandidates(
  whitening: RehabDentalWhiteningPlan,
): Array<Omit<AnnexProcedureBudgetLine, 'id'>> {
  return REHAB_DENTAL_WHITENING_OPTIONS.filter((option) => whitening[option.id]).map((option) => ({
    procedure: option.label,
    anatomicalZone: 'General',
    quantity: 1,
    unitPrice: 0,
    source: 'import' as const,
    importKey: `whitening:${option.id}`,
    paymentMethod: 'contado' as const,
    scheduleNotes: '',
  }))
}

/** Prefijos de líneas importadas del esquema / resumen (no manuales). */
const IMPORT_KEY_PREFIXES = ['summary:', 'visual:', 'prosthesis:', 'whitening:'] as const

function isPlanningImportKey(key: string | undefined): boolean {
  if (!key) return false
  return IMPORT_KEY_PREFIXES.some((prefix) => key.startsWith(prefix))
}

/**
 * Historias antiguas podían tener una fila por pieza (`visual:…`) y otra agrupada
 * (`summary:…`). Conserva precios del resumen y elimina las filas por pieza.
 */
export function collapseLegacyRehabBudgetVisualLines(
  budget: AnnexProcedureBudget | null | undefined,
): AnnexProcedureBudget {
  const safeBudget = normalizeAnnexProcedureBudget(budget)
  const visualByTreatment = new Map<
    string,
    { teeth: string[]; unitPrice: number; procedure: string; cupsCode?: string; material?: string }
  >()
  const kept: AnnexProcedureBudgetLine[] = []

  for (const line of safeBudget.lines) {
    const key = line.importKey ?? ''
    const visualMatch = key.match(/^visual:(\d{1,2}):(.+)$/)
    if (!visualMatch) {
      kept.push(line)
      continue
    }
    const tooth = visualMatch[1]
    const treatmentId = visualMatch[2]
    const current = visualByTreatment.get(treatmentId) ?? {
      teeth: [],
      unitPrice: 0,
      procedure: line.procedure,
      cupsCode: line.cupsCode,
      material: line.material,
    }
    current.teeth.push(tooth)
    current.unitPrice = Math.max(current.unitPrice, line.unitPrice ?? 0)
    if (!current.cupsCode && line.cupsCode) current.cupsCode = line.cupsCode
    if (!current.material && line.material) current.material = line.material
    if (line.procedure?.trim()) current.procedure = line.procedure.replace(/\s*[—–-]\s*pieza\s+\d{1,2}\s*$/i, '').trim() || current.procedure
    visualByTreatment.set(treatmentId, current)
  }

  if (visualByTreatment.size === 0) return safeBudget

  const summaryKeys = new Set(
    kept.map((line) => line.importKey).filter((key): key is string => Boolean(key?.startsWith('summary:'))),
  )

  for (const [treatmentId, group] of visualByTreatment) {
    const summaryKey = `summary:${treatmentId}`
    const existingSummary = kept.find((line) => line.importKey === summaryKey)
    if (existingSummary) {
      const mergedTeeth = sortTeethIds([
        ...group.teeth,
        ...(existingSummary.anatomicalZone ?? '')
          .split(/[,;]+/)
          .map((part) => part.trim())
          .filter(Boolean),
      ])
      existingSummary.anatomicalZone = mergedTeeth.join(', ')
      existingSummary.quantity = Math.max(mergedTeeth.length, existingSummary.quantity ?? 1)
      existingSummary.unitPrice = Math.max(existingSummary.unitPrice ?? 0, group.unitPrice)
      existingSummary.toothNumber = undefined
      if (!existingSummary.cupsCode && group.cupsCode) existingSummary.cupsCode = group.cupsCode
      continue
    }
    if (summaryKeys.has(summaryKey)) continue
    const sorted = sortTeethIds(group.teeth)
    kept.push(
      createBlankAnnexProcedureBudgetLine({
        id: generateId(),
        procedure: group.procedure || treatmentLabel(treatmentId),
        cupsCode: group.cupsCode,
        material: group.material ?? '',
        anatomicalZone: sorted.join(', '),
        quantity: sorted.length,
        unitPrice: group.unitPrice,
        source: 'import',
        importKey: summaryKey,
      }),
    )
  }

  return { active: true, lines: kept }
}

/** Candidatos del Resumen Tratamiento Restaurador (+ aclaramiento si aplica). */
export function collectRehabPlanningBudgetCandidates(
  annex: RehabilitationAestheticsAnnex,
): Array<Omit<AnnexProcedureBudgetLine, 'id'>> {
  const candidates = restorativeSummaryCandidates(annex)
  if (annex.dentalWhitening) {
    candidates.push(...whiteningCandidates(annex.dentalWhitening))
  }
  return candidates
}

export function canImportRehabPlanningBudget(annex: RehabilitationAestheticsAnnex): boolean {
  return collectRehabPlanningBudgetCandidates(annex).length > 0
}

/**
 * Sincroniza el presupuesto con el Resumen Tratamiento Restaurador:
 * actualiza filas importadas (cantidad, zona, nombre), agrega nuevas,
 * quita obsoletas y conserva precio/pago de claves que siguen existiendo.
 */
export function importRehabPlanningIntoBudget(
  annex: RehabilitationAestheticsAnnex,
  budget: AnnexProcedureBudget | null | undefined,
): { budget: AnnexProcedureBudget; added: number; skipped: number } {
  const safeBudget = collapseLegacyRehabBudgetVisualLines(budget)
  const candidates = collectRehabPlanningBudgetCandidates(annex)
  const candidateByKey = new Map(
    candidates
      .filter((candidate) => candidate.importKey)
      .map((candidate) => [candidate.importKey!, candidate]),
  )

  const manualLines = safeBudget.lines.filter((line) => !isPlanningImportKey(line.importKey))
  const previousImportByKey = new Map(
    safeBudget.lines
      .filter((line) => isPlanningImportKey(line.importKey) && line.importKey)
      .map((line) => [line.importKey!, line]),
  )

  const syncedImportLines: AnnexProcedureBudgetLine[] = []
  let added = 0
  let skipped = 0

  for (const [importKey, candidate] of candidateByKey) {
    const previous = previousImportByKey.get(importKey)
    if (previous) {
      skipped += 1
      syncedImportLines.push({
        ...previous,
        procedure: candidate.procedure,
        cupsCode: candidate.cupsCode ?? previous.cupsCode,
        anatomicalZone: candidate.anatomicalZone,
        toothNumber: candidate.toothNumber,
        quantity: candidate.quantity,
        material: previous.material || candidate.material || '',
        source: 'import',
        importKey,
      })
      continue
    }
    added += 1
    syncedImportLines.push(
      createBlankAnnexProcedureBudgetLine({
        ...candidate,
        id: generateId(),
      }),
    )
  }

  return {
    budget: {
      active: true,
      lines: [...syncedImportLines, ...manualLines],
    },
    added,
    skipped,
  }
}
