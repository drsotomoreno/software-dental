import {
  REHAB_PROTESIS_PARCIAL_REMOVIBLE_LABEL,
  REHAB_PROTESIS_TOTAL_LABEL,
  REHAB_TREATMENT_OPTIONS,
} from '@/components/clinical/rehabilitation/rehab-odontogram/constants'
import {
  REHAB_DENTAL_WHITENING_OPTIONS,
  type RehabDentalWhiteningPlan,
} from '@/constants/dentalWhitening'
import {
  createBlankAnnexProcedureBudgetLine,
  normalizeAnnexProcedureBudget,
  type AnnexProcedureBudget,
  type AnnexProcedureBudgetLine,
} from '@/types/annexProcedureBudget'
import {
  formatRehabArchProsthesisScope,
  type RehabArchProsthesisPlan,
  type RehabVisualPlanEntry,
  type RehabilitationAestheticsAnnex,
} from '@/types/rehabilitationAestheticsAnnex'
import { generateId } from '@/utils/crypto'

function treatmentLabel(tratamiento: string): string {
  return REHAB_TREATMENT_OPTIONS.find((option) => option.id === tratamiento)?.label ?? tratamiento
}

function prosthesisLine(
  kind: 'protesis_total' | 'protesis_parcial_removible',
  plan: RehabArchProsthesisPlan,
): Omit<AnnexProcedureBudgetLine, 'id'> {
  const label =
    kind === 'protesis_total' ? REHAB_PROTESIS_TOTAL_LABEL : REHAB_PROTESIS_PARCIAL_REMOVIBLE_LABEL
  return {
    procedure: `${label} (${formatRehabArchProsthesisScope(plan.scope)})`,
    anatomicalZone:
      plan.scope === 'superior'
        ? 'Arcada Superior'
        : plan.scope === 'inferior'
          ? 'Arcada Inferior'
          : 'General',
    quantity: 1,
    unitPrice: 0,
    source: 'import',
    importKey: `prosthesis:${kind}:${plan.scope}`,
    paymentMethod: 'contado',
    scheduleNotes: '',
  }
}

function visualPlanCandidate(
  entry: RehabVisualPlanEntry,
): Omit<AnnexProcedureBudgetLine, 'id'> | null {
  if (!entry.tratamiento) return null
  const label = treatmentLabel(entry.tratamiento)
  return {
    procedure: `${label} — pieza ${entry.dienteId}`,
    toothNumber: Number(entry.dienteId) || undefined,
    anatomicalZone: entry.dienteId,
    quantity: 1,
    unitPrice: 0,
    source: 'import',
    importKey: `visual:${entry.dienteId}:${entry.tratamiento}`,
    paymentMethod: 'contado',
    scheduleNotes: '',
  }
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

/** Candidatos que saldrían del esquema de planificación + aclaramiento. */
export function collectRehabPlanningBudgetCandidates(
  annex: RehabilitationAestheticsAnnex,
): Array<Omit<AnnexProcedureBudgetLine, 'id'>> {
  const candidates: Array<Omit<AnnexProcedureBudgetLine, 'id'>> = []

  for (const entry of annex.visualTreatmentPlan ?? []) {
    const candidate = visualPlanCandidate(entry)
    if (candidate) candidates.push(candidate)
  }

  if (annex.protesisTotal) {
    candidates.push(prosthesisLine('protesis_total', annex.protesisTotal))
  }
  if (annex.protesisParcialRemovible) {
    candidates.push(prosthesisLine('protesis_parcial_removible', annex.protesisParcialRemovible))
  }

  if (annex.dentalWhitening) {
    candidates.push(...whiteningCandidates(annex.dentalWhitening))
  }
  return candidates
}

export function canImportRehabPlanningBudget(annex: RehabilitationAestheticsAnnex): boolean {
  return collectRehabPlanningBudgetCandidates(annex).length > 0
}

/**
 * Agrega al presupuesto las líneas nuevas del esquema de planificación
 * sin duplicar las que ya tienen la misma importKey.
 */
export function importRehabPlanningIntoBudget(
  annex: RehabilitationAestheticsAnnex,
  budget: AnnexProcedureBudget | null | undefined,
): { budget: AnnexProcedureBudget; added: number; skipped: number } {
  const safeBudget = normalizeAnnexProcedureBudget(budget)
  const existingKeys = new Set(
    safeBudget.lines.map((line) => line.importKey).filter((key): key is string => Boolean(key)),
  )
  const candidates = collectRehabPlanningBudgetCandidates(annex)
  const additions: AnnexProcedureBudgetLine[] = []
  let skipped = 0

  for (const candidate of candidates) {
    if (candidate.importKey && existingKeys.has(candidate.importKey)) {
      skipped += 1
      continue
    }
    if (candidate.importKey) existingKeys.add(candidate.importKey)
    additions.push(
      createBlankAnnexProcedureBudgetLine({
        ...candidate,
        id: generateId(),
      }),
    )
  }

  if (additions.length === 0) {
    return { budget: safeBudget, added: 0, skipped }
  }

  return {
    budget: {
      active: true,
      lines: [...safeBudget.lines, ...additions],
    },
    added: additions.length,
    skipped,
  }
}
