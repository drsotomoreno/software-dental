/** Anexo clínico — Rehabilitación oral y estética dental */

import type { RehabRestorationDetails } from '@/constants/rehabilitationRestoration'
import { normalizeRestorationDetails, formatImplantRestorationSpecSummary, formatRehabRestorationSpecSummary, REHAB_FIXED_RESTORATION_TREATMENTS } from '@/constants/rehabilitationRestoration'
import { REHAB_TREATMENT_OPTIONS, IMPLANT_ODONTOGRAM_TREATMENT_OPTIONS } from '@/components/clinical/rehabilitation/rehab-odontogram/constants'
import {
  IMPLANT_FIXTURE_SIZE_OPTIONS,
  implantFixtureSizeLabel,
  type ImplantFixtureSize,
} from '@/constants/implantPlanning'
import {
  createEmptyDentalWhiteningPlan,
  normalizeDentalWhiteningPlan,
  type RehabDentalWhiteningPlan,
} from '@/constants/dentalWhitening'
import {
  createEmptySmileAnalysis,
  normalizeSmileAnalysis,
  type RehabSmileAnalysis,
} from '@/constants/smileAnalysis'
import type { RehabArchToothColorSelection } from '@/constants/vitaClassicShades'
import { isRehabArchToothColorSelection } from '@/constants/vitaClassicShades'
import { REHAB_ODONTOGRAM_TEETH } from '@/components/clinical/rehabilitation/rehab-odontogram/constants'
import {
  createEmptyMidlineDeviation,
  type MidlineDeviationValue,
} from '@/types/orthodonticsAnnex'

export type RehabTreatmentType =
  | 'corona_individual'
  | 'carilla'
  | 'implante'
  | 'pilar_ppf'
  | 'pontico_ppf'
  | 'incrustacion'

export interface RehabVisualPlanEntry {
  dienteId: string
  eliminado?: boolean
  tratamiento?: RehabTreatmentType
  color?: string
  implantSize?: ImplantFixtureSize
}

export type RehabProtesisTotalScope = 'superior_inferior' | 'superior' | 'inferior'

export interface RehabArchProsthesisPlan {
  scope: RehabProtesisTotalScope
  color: string
}

/** @deprecated Use RehabArchProsthesisPlan */
export type RehabProtesisTotalPlan = RehabArchProsthesisPlan

export interface RehabInitialFindings {
  upperToothColor: RehabArchToothColorSelection
  lowerToothColor: RehabArchToothColorSelection
  /** Piezas FDI marcadas como oscurecidas */
  darkenedTeeth: string[]
  midlineDeviation: MidlineDeviationValue
  smileAnalysis: RehabSmileAnalysis
}

export interface RehabPlanningSchema {
  visualTreatmentPlan: RehabVisualPlanEntry[]
  protesisTotal: RehabArchProsthesisPlan | null
  protesisParcialRemovible: RehabArchProsthesisPlan | null
  restorationDetails: RehabRestorationDetails
}

export interface RehabilitationAestheticsAnnex extends RehabPlanningSchema {
  initialFindings: RehabInitialFindings
  /** Contraindicaciones y limitaciones del caso */
  contraindications: string
  notes: string
  /** Plan de blanqueamiento dental */
  dentalWhitening: RehabDentalWhiteningPlan
}

export function createEmptyRehabInitialFindings(): RehabInitialFindings {
  return {
    upperToothColor: '',
    lowerToothColor: '',
    darkenedTeeth: [],
    midlineDeviation: createEmptyMidlineDeviation(),
    smileAnalysis: createEmptySmileAnalysis(),
  }
}

export function createEmptyRehabilitationAestheticsAnnex(): RehabilitationAestheticsAnnex {
  return {
    ...createEmptyRehabPlanningSchema(),
    initialFindings: createEmptyRehabInitialFindings(),
    contraindications: '',
    notes: '',
    dentalWhitening: createEmptyDentalWhiteningPlan(),
  }
}

export function createEmptyRehabPlanningSchema(): RehabPlanningSchema {
  return {
    visualTreatmentPlan: [],
    protesisTotal: null,
    protesisParcialRemovible: null,
    restorationDetails: {},
  }
}

function isQuadrantMmValue(value: unknown): value is MidlineDeviationValue {
  if (!value || typeof value !== 'object') return false
  const v = value as MidlineDeviationValue
  return (
    typeof v.supDerecha === 'number' &&
    typeof v.supIzquierda === 'number' &&
    typeof v.infDerecha === 'number' &&
    typeof v.infIzquierda === 'number'
  )
}

function normalizeDarkenedTeeth(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const valid = new Set(
    Object.values(REHAB_ODONTOGRAM_TEETH).flat().map((fdi) => String(fdi)),
  )
  return value
    .map((item) => String(item))
    .filter((id) => valid.has(id))
    .sort((a, b) => Number(a) - Number(b))
}

function normalizeArchToothColor(value: unknown): RehabArchToothColorSelection {
  if (isRehabArchToothColorSelection(value)) return value
  return ''
}

function normalizeInitialFindings(
  data?: Partial<RehabInitialFindings> & { currentToothColor?: unknown },
): RehabInitialFindings {
  const empty = createEmptyRehabInitialFindings()
  const midlineDeviation = isQuadrantMmValue(data?.midlineDeviation)
    ? { ...empty.midlineDeviation, ...data.midlineDeviation }
    : empty.midlineDeviation

  const legacyColor = normalizeArchToothColor(data?.currentToothColor)

  return {
    upperToothColor: normalizeArchToothColor(data?.upperToothColor) || legacyColor,
    lowerToothColor: normalizeArchToothColor(data?.lowerToothColor) || legacyColor,
    darkenedTeeth: normalizeDarkenedTeeth(data?.darkenedTeeth),
    midlineDeviation,
    smileAnalysis: normalizeSmileAnalysis(data?.smileAnalysis),
  }
}

function normalizeRehabTreatmentType(
  tratamiento: unknown,
): RehabTreatmentType | undefined {
  if (tratamiento === 'restauracion_otros') return 'incrustacion'
  if (tratamiento === 'protesis_parcial_removible') return undefined
  if (
    tratamiento === 'corona_individual' ||
    tratamiento === 'carilla' ||
    tratamiento === 'implante' ||
    tratamiento === 'pilar_ppf' ||
    tratamiento === 'pontico_ppf' ||
    tratamiento === 'incrustacion'
  ) {
    return tratamiento
  }
  return undefined
}

function isImplantFixtureSize(value: unknown): value is ImplantFixtureSize {
  return IMPLANT_FIXTURE_SIZE_OPTIONS.some((item) => item.id === value)
}

function normalizeVisualPlanEntry(entry: Partial<RehabVisualPlanEntry>): RehabVisualPlanEntry | null {
  if (!entry.dienteId) return null
  const dienteId = String(entry.dienteId)
  const tratamiento = normalizeRehabTreatmentType(entry.tratamiento)
  if (entry.eliminado && !tratamiento) {
    return { dienteId, eliminado: true }
  }
  if (!tratamiento || !entry.color) return null
  return {
    dienteId,
    eliminado: entry.eliminado,
    tratamiento,
    color: entry.color,
    ...(tratamiento === 'implante' && isImplantFixtureSize(entry.implantSize)
      ? { implantSize: entry.implantSize }
      : {}),
  }
}

export function formatRehabArchProsthesisScope(scope: RehabProtesisTotalScope): string {
  if (scope === 'superior_inferior') return 'Superior e inferior'
  if (scope === 'superior') return 'Solo superior'
  return 'Solo inferior'
}

/** @deprecated Use formatRehabArchProsthesisScope */
export const formatRehabProtesisTotalScope = formatRehabArchProsthesisScope

function normalizeArchProsthesisPlan(
  data?: RehabArchProsthesisPlan | null,
): RehabArchProsthesisPlan | null {
  if (!data?.scope || typeof data.color !== 'string') return null
  if (data.scope !== 'superior_inferior' && data.scope !== 'superior' && data.scope !== 'inferior') {
    return null
  }
  return { scope: data.scope, color: data.color }
}

export function formatRehabMidlineDeviation(value: MidlineDeviationValue): string {
  const parts: string[] = []
  if (value.supDerecha !== 0) parts.push(`sup. der. ${value.supDerecha} mm`)
  if (value.supIzquierda !== 0) parts.push(`sup. izq. ${value.supIzquierda} mm`)
  if (value.infDerecha !== 0) parts.push(`inf. der. ${value.infDerecha} mm`)
  if (value.infIzquierda !== 0) parts.push(`inf. izq. ${value.infIzquierda} mm`)
  return parts.join(', ')
}

export function formatRehabPlanningSummaryLines(planning: RehabPlanningSchema): string[] {
  const details = planning.restorationDetails ?? {}
  const lines: string[] = []

  if (planning.protesisTotal) {
    lines.push(`Prótesis total: ${formatRehabArchProsthesisScope(planning.protesisTotal.scope)}`)
  }
  if (planning.protesisParcialRemovible) {
    lines.push(
      `Prótesis parcial removible: ${formatRehabArchProsthesisScope(planning.protesisParcialRemovible.scope)}`,
    )
  }

  if (planning.protesisParcialRemovible) {
    const spec = formatRehabRestorationSpecSummary(details.protesis_parcial_removible)
    if (spec) lines.push(`PPR — ${spec}`)
  }

  const activeTreatments = new Set(
    planning.visualTreatmentPlan
      .map((entry) => entry.tratamiento)
      .filter((tratamiento): tratamiento is NonNullable<typeof tratamiento> => Boolean(tratamiento)),
  )

  for (const option of REHAB_TREATMENT_OPTIONS) {
    if (!activeTreatments.has(option.id) || !REHAB_FIXED_RESTORATION_TREATMENTS.includes(option.id)) {
      continue
    }
    const spec = formatRehabRestorationSpecSummary(details[option.id])
    if (spec) lines.push(`${option.label} — ${spec}`)
  }

  if (planning.visualTreatmentPlan.length > 0) {
    lines.push(
      `Plan visual: ${planning.visualTreatmentPlan
        .map((entry) => {
          if (entry.eliminado && !entry.tratamiento) return `${entry.dienteId}=eliminado`
          return `${entry.dienteId}=${entry.tratamiento}${entry.eliminado ? '(eliminado)' : ''}`
        })
        .join(', ')}`,
    )
  }

  return lines
}

export function formatDentalImplantPlanningSummaryLines(planning: RehabPlanningSchema): string[] {
  const lines: string[] = []

  for (const option of IMPLANT_ODONTOGRAM_TREATMENT_OPTIONS) {
    const entries = planning.visualTreatmentPlan.filter((entry) => entry.tratamiento === option.id)
    if (entries.length === 0) continue

    const detail = entries
      .map((entry) => {
        const suffix = entry.eliminado ? ' (eliminado)' : ''
        if (entry.tratamiento === 'implante' && entry.implantSize) {
          return `${entry.dienteId} — ${implantFixtureSizeLabel(entry.implantSize)}${suffix}`
        }
        return `${entry.dienteId}${suffix}`
      })
      .join(', ')

    const spec = formatImplantRestorationSpecSummary(planning.restorationDetails?.[option.id])
    lines.push(spec ? `${option.label}: ${detail} — ${spec}` : `${option.label}: ${detail}`)
  }

  const eliminatedOnly = planning.visualTreatmentPlan.filter(
    (entry) => entry.eliminado && !entry.tratamiento,
  )
  if (eliminatedOnly.length > 0) {
    lines.push(`Piezas eliminadas: ${eliminatedOnly.map((entry) => entry.dienteId).join(', ')}`)
  }

  return lines
}

export function normalizeRehabPlanningSchema(
  data?: Partial<RehabPlanningSchema>,
): RehabPlanningSchema {
  const visualTreatmentPlan = Array.isArray(data?.visualTreatmentPlan)
    ? data.visualTreatmentPlan
        .map((entry) => normalizeVisualPlanEntry(entry))
        .filter((entry): entry is RehabVisualPlanEntry => entry !== null)
    : []

  return {
    visualTreatmentPlan,
    protesisTotal: normalizeArchProsthesisPlan(data?.protesisTotal),
    protesisParcialRemovible: normalizeArchProsthesisPlan(data?.protesisParcialRemovible),
    restorationDetails: normalizeRestorationDetails(data?.restorationDetails),
  }
}

export function normalizeRehabilitationAestheticsAnnex(
  data?: Partial<RehabilitationAestheticsAnnex>,
): RehabilitationAestheticsAnnex {
  return {
    ...normalizeRehabPlanningSchema(data),
    initialFindings: normalizeInitialFindings(data?.initialFindings),
    contraindications: data?.contraindications ?? '',
    notes: data?.notes ?? '',
    dentalWhitening: normalizeDentalWhiteningPlan(data?.dentalWhitening),
  }
}
