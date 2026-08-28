import type { OrthodonticsAnnex } from '@/types/specializedAnnexes'
import {
  createEmptyPhase,
  type MultiPhaseBudgetFields,
  type OrthodonticBudgetState,
  type StandardBudgetFields,
} from '@/components/clinical/orthodontics/calculator/types'
import {
  createEmptyCrowdingSpacingValue,
  createEmptyFacialAnalysis,
  createEmptyMalocclusionAssessment,
  createEmptyMidlineDeviation,
  createEmptyMaxillaryOrthopedicsAppliance,
  createEmptyOverjetAssessment,
  createEmptyOverbiteAssessment,
  orthodonticTreatmentTypeUsesAligners,
  orthodonticTreatmentTypeUsesBrackets,
  orthodonticTreatmentTypeUsesMaxillaryOrthopedics,
  formatOverbiteAssessment,
  formatOverjetAssessment,
  formatOrthodonticTreatmentDurationMonths,
  MIN_ORTHODONTIC_TREATMENT_DURATION_MONTHS,
  MAX_ORTHODONTIC_TREATMENT_DURATION_MONTHS,
  type AlignerPhaseCount,
  type AlignerTreatmentMode,
  type MaxillaryOrthopedicsAppliance,
  type MaxillaryOrthopedicsApplianceType,
  type OverjetAssessment,
  type OverjetClassification,
  type OverbiteAssessment,
  type OverbiteClassification,
  SAGITAL_CLASS_OPTIONS,
  TRANSVERSAL_DENTAL_OPTIONS,
  TRANSVERSAL_SKELETAL_OPTIONS,
  VERTICAL_SKELETAL_OPTIONS,
  type CrowdingSpacingValue,
  type FacialAnalysis,
  type SagittalFacialProfile,
  type VerticalFacialType,
  type ConventionalBracketType,
  type OrthodonticTreatmentType,
  type MalocclusionAssessment,
  type MidlineDeviationValue,
  type SagitalClass,
  type TransversalDentalType,
  type TransversalSkeletalType,
  type VerticalDentalType,
  type VerticalSkeletalType,
} from '@/types/orthodonticsAnnex'

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

function isLegacyCrowdingSpacingValue(
  value: unknown,
): value is { superior?: { mm?: number }; inferior?: { mm?: number } } {
  if (!value || typeof value !== 'object') return false
  const v = value as { superior?: unknown; inferior?: unknown }
  return Boolean(v.superior || v.inferior)
}

function normalizeCrowdingSpacingValue(value: unknown): CrowdingSpacingValue {
  if (isQuadrantMmValue(value)) {
    return { ...createEmptyCrowdingSpacingValue(), ...value }
  }

  if (isLegacyCrowdingSpacingValue(value)) {
    const superiorMm =
      typeof value.superior?.mm === 'number' ? value.superior.mm : 0
    const inferiorMm =
      typeof value.inferior?.mm === 'number' ? value.inferior.mm : 0

    return {
      supDerecha: superiorMm,
      supIzquierda: superiorMm,
      infDerecha: inferiorMm,
      infIzquierda: inferiorMm,
    }
  }

  return createEmptyCrowdingSpacingValue()
}

function normalizeSagitalClass(value: unknown): SagitalClass {
  if (value === 'I' || value === 'II' || value === 'III') return value

  if (typeof value === 'string') {
    const normalized = value
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')

    if (normalized.includes('iii') || normalized.includes('clase 3')) return 'III'
    if (normalized.includes('ii') || normalized.includes('clase 2')) return 'II'
    if (normalized.includes('i') || normalized.includes('clase 1')) return 'I'
  }

  return ''
}

function normalizeVerticalDental(value: unknown): VerticalDentalType {
  if (
    value === 'mordida_abierta' ||
    value === 'mordida_profunda' ||
    value === 'normal'
  ) {
    return value
  }

  if (typeof value === 'string') {
    const normalized = value
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')

    if (normalized.includes('abierta')) return 'mordida_abierta'
    if (normalized.includes('profunda')) return 'mordida_profunda'
    if (normalized === 'normal') return 'normal'
  }

  return ''
}

function normalizeVerticalSkeletal(value: unknown): VerticalSkeletalType {
  if (
    value === 'hiperdivergente' ||
    value === 'normodivergente' ||
    value === 'hipodivergente'
  ) {
    return value
  }

  if (typeof value === 'string') {
    const normalized = value
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')

    if (normalized.includes('hiperdivergente')) return 'hiperdivergente'
    if (normalized.includes('normodivergente')) return 'normodivergente'
    if (normalized.includes('hipodivergente')) return 'hipodivergente'
  }

  return ''
}

function normalizeTransversalDental(value: unknown): TransversalDentalType {
  if (
    value === 'mordida_cruzada_bilateral' ||
    value === 'mordida_cruzada_unilateral_derecha' ||
    value === 'mordida_cruzada_unilateral_izquierda'
  ) {
    return value
  }

  if (typeof value === 'string') {
    const normalized = value
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')

    if (normalized.includes('bilateral')) return 'mordida_cruzada_bilateral'
    if (normalized.includes('derecha')) return 'mordida_cruzada_unilateral_derecha'
    if (normalized.includes('izquierda')) return 'mordida_cruzada_unilateral_izquierda'
  }

  return ''
}

function normalizeTransversalSkeletal(value: unknown): TransversalSkeletalType {
  if (
    value === 'desviacion_esqueletica_derecha' ||
    value === 'desviacion_esqueletica_izquierda'
  ) {
    return value
  }

  if (typeof value === 'string') {
    const normalized = value
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')

    if (normalized.includes('derecha')) return 'desviacion_esqueletica_derecha'
    if (normalized.includes('izquierda')) return 'desviacion_esqueletica_izquierda'
  }

  return ''
}

function verticalDentalToOverbite(vertical: VerticalDentalType): OverbiteAssessment {
  if (vertical === 'normal') return { classification: 'normal', valueMm: null }
  if (vertical === 'mordida_profunda') {
    return { classification: 'mordida_profunda', valueMm: null }
  }
  if (vertical === 'mordida_abierta') {
    return { classification: 'mordida_abierta', valueMm: null }
  }
  return createEmptyOverbiteAssessment()
}

function hasMalocclusionAssessmentContent(assessment: MalocclusionAssessment): boolean {
  return (
    Boolean(assessment.sagitalDental) ||
    Boolean(assessment.sagitalEsqueletica) ||
    Boolean(assessment.overjet.classification) ||
    Boolean(assessment.overbite.classification) ||
    Boolean(assessment.verticalEsqueletica) ||
    Boolean(assessment.transversalDental) ||
    Boolean(assessment.transversalEsqueletica)
  )
}

function normalizeMalocclusionAssessment(
  value: unknown,
  legacyOverjet?: unknown,
  legacyOverbite?: unknown,
  legacyOverjetOverbite = '',
): MalocclusionAssessment {
  const empty = createEmptyMalocclusionAssessment()
  if (!value || typeof value !== 'object') {
    return {
      ...empty,
      overjet: normalizeOverjetAssessment(legacyOverjet, legacyOverjetOverbite),
      overbite: normalizeOverbiteAssessment(legacyOverbite),
    }
  }

  const v = value as Partial<MalocclusionAssessment> & { verticalDental?: VerticalDentalType }
  let overjet = normalizeOverjetAssessment(v.overjet)
  let overbite = normalizeOverbiteAssessment(v.overbite)

  if (!overbite.classification && v.verticalDental) {
    overbite = verticalDentalToOverbite(normalizeVerticalDental(v.verticalDental))
  }

  if (!overjet.classification) {
    overjet = normalizeOverjetAssessment(legacyOverjet, legacyOverjetOverbite)
  }
  if (!overbite.classification) {
    overbite = normalizeOverbiteAssessment(legacyOverbite)
  }

  return {
    sagitalDental: normalizeSagitalClass(v.sagitalDental),
    sagitalEsqueletica: normalizeSagitalClass(v.sagitalEsqueletica),
    overjet,
    overbite,
    verticalEsqueletica: normalizeVerticalSkeletal(v.verticalEsqueletica),
    transversalDental: normalizeTransversalDental(v.transversalDental),
    transversalEsqueletica: normalizeTransversalSkeletal(v.transversalEsqueletica),
  }
}

function normalizeConventionalBracketType(value: unknown): ConventionalBracketType {
  const valid: ConventionalBracketType[] = [
    'metalicos_convencionales',
    'autoligado',
    'ceramicos_transparentes',
  ]

  if (valid.includes(value as ConventionalBracketType)) {
    return value as ConventionalBracketType
  }

  return ''
}

function normalizeNonNegativeNumber(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return 0
  return Math.round(value * 100) / 100
}

function normalizeOrthodonticBudget(value: unknown): OrthodonticBudgetState | null {
  if (!value || typeof value !== 'object') return null

  const budget = value as Partial<OrthodonticBudgetState>

  if (budget.kind === 'standard' && budget.values && typeof budget.values === 'object') {
    const values = budget.values as Partial<StandardBudgetFields>
    return {
      kind: 'standard',
      values: {
        initialPayment: normalizeNonNegativeNumber(values.initialPayment),
        monthlyControlsCount: Math.max(
          0,
          Math.trunc(Number(values.monthlyControlsCount) || 0),
        ),
        pricePerControl: normalizeNonNegativeNumber(values.pricePerControl),
        retainerPrice: normalizeNonNegativeNumber(values.retainerPrice),
      },
    }
  }

  if (budget.kind === 'multi_phase' && budget.values && typeof budget.values === 'object') {
    const values = budget.values as Partial<MultiPhaseBudgetFields>
    const phases = Array.isArray(values.phases)
      ? values.phases.map((phase, index) => ({
          phaseName:
            typeof phase?.phaseName === 'string' && phase.phaseName.trim()
              ? phase.phaseName.trim()
              : `Fase ${index + 1}`,
          initialPayment: normalizeNonNegativeNumber(phase?.initialPayment),
          monthlyControlsCount: Math.max(
            0,
            Math.trunc(Number(phase?.monthlyControlsCount) || 0),
          ),
          pricePerControl: normalizeNonNegativeNumber(phase?.pricePerControl),
        }))
      : [createEmptyPhase(0)]

    return {
      kind: 'multi_phase',
      values: {
        phases: phases.length > 0 ? phases : [createEmptyPhase(0)],
        retainerPrice: normalizeNonNegativeNumber(values.retainerPrice),
      },
    }
  }

  return null
}

function normalizeTreatmentDurationMonths(
  months: unknown,
  legacyText = '',
): number | null {
  if (typeof months === 'number' && Number.isInteger(months)) {
    if (months >= MIN_ORTHODONTIC_TREATMENT_DURATION_MONTHS && months <= MAX_ORTHODONTIC_TREATMENT_DURATION_MONTHS) {
      return months
    }
    return null
  }

  if (typeof months === 'string' && months.trim()) {
    const parsed = Number(months.trim())
    if (
      Number.isInteger(parsed) &&
      parsed >= MIN_ORTHODONTIC_TREATMENT_DURATION_MONTHS &&
      parsed <= MAX_ORTHODONTIC_TREATMENT_DURATION_MONTHS
    ) {
      return parsed
    }
  }

  if (legacyText.trim()) {
    const match = legacyText.match(/\d+/)
    if (match) {
      const parsed = Number(match[0])
      if (
        Number.isInteger(parsed) &&
        parsed >= MIN_ORTHODONTIC_TREATMENT_DURATION_MONTHS &&
        parsed <= MAX_ORTHODONTIC_TREATMENT_DURATION_MONTHS
      ) {
        return parsed
      }
    }
  }

  return null
}

function normalizeOrthodonticTreatmentType(value: unknown): OrthodonticTreatmentType {
  if (value === 'convencional_brackets_metalicos') {
    return 'convencional_brackets'
  }

  const valid: OrthodonticTreatmentType[] = [
    'convencional_brackets',
    'alineadores',
    'combinado_brackets_alineadores',
    'ortopedia_maxilar',
    'combinado_cirugia_maxilofacial',
  ]

  if (valid.includes(value as OrthodonticTreatmentType)) {
    return value as OrthodonticTreatmentType
  }

  return ''
}

function normalizeAlignerTreatmentMode(value: unknown): AlignerTreatmentMode {
  if (value === 'una_sola_tanda' || value === 'por_fases') {
    return value
  }
  return ''
}

function normalizeAlignerPhaseCount(value: unknown): AlignerPhaseCount {
  if (value === '2' || value === '3' || value === '4') {
    return value
  }
  if (value === 2 || value === 3 || value === 4) {
    return String(value) as AlignerPhaseCount
  }
  return ''
}

function normalizeMaxillaryOrthopedicsApplianceType(
  value: unknown,
): MaxillaryOrthopedicsApplianceType {
  if (value === 'superior' || value === 'inferior' || value === 'bimaxilar') {
    return value
  }
  return ''
}

function normalizeMaxillaryOrthopedicsAppliance(value: unknown): MaxillaryOrthopedicsAppliance {
  if (!value || typeof value !== 'object') {
    return createEmptyMaxillaryOrthopedicsAppliance()
  }

  const appliance = value as Partial<MaxillaryOrthopedicsAppliance>
  return {
    type: normalizeMaxillaryOrthopedicsApplianceType(appliance.type),
    name: typeof appliance.name === 'string' ? appliance.name : '',
    description: typeof appliance.description === 'string' ? appliance.description : '',
  }
}

function normalizeOrthodonticTreatmentPlan(
  data?: {
    treatmentType?: unknown
    conventionalBracketType?: unknown
    alignerTreatmentMode?: unknown
    alignerPhaseCount?: unknown
    maxillaryOrthopedicsAppliance?: unknown
  },
): {
  treatmentType: OrthodonticTreatmentType
  conventionalBracketType: ConventionalBracketType
  alignerTreatmentMode: AlignerTreatmentMode
  alignerPhaseCount: AlignerPhaseCount
  maxillaryOrthopedicsAppliance: MaxillaryOrthopedicsAppliance
} {
  const treatmentTypeRaw = data?.treatmentType
  const bracketTypeRaw = data?.conventionalBracketType
  const alignerModeRaw = data?.alignerTreatmentMode
  const alignerPhaseRaw = data?.alignerPhaseCount

  if (treatmentTypeRaw === 'convencional_brackets_metalicos') {
    return {
      treatmentType: 'convencional_brackets',
      conventionalBracketType:
        normalizeConventionalBracketType(bracketTypeRaw) || 'metalicos_convencionales',
      alignerTreatmentMode: '',
      alignerPhaseCount: '',
      maxillaryOrthopedicsAppliance: createEmptyMaxillaryOrthopedicsAppliance(),
    }
  }

  const treatmentType = normalizeOrthodonticTreatmentType(treatmentTypeRaw)
  const alignerTreatmentMode = orthodonticTreatmentTypeUsesAligners(treatmentType)
    ? normalizeAlignerTreatmentMode(alignerModeRaw)
    : ''
  const alignerPhaseCount =
    alignerTreatmentMode === 'por_fases'
      ? normalizeAlignerPhaseCount(alignerPhaseRaw)
      : ''
  const maxillaryOrthopedicsAppliance = orthodonticTreatmentTypeUsesMaxillaryOrthopedics(
    treatmentType,
  )
    ? normalizeMaxillaryOrthopedicsAppliance(data?.maxillaryOrthopedicsAppliance)
    : createEmptyMaxillaryOrthopedicsAppliance()

  return {
    treatmentType,
    conventionalBracketType: orthodonticTreatmentTypeUsesBrackets(treatmentType)
      ? normalizeConventionalBracketType(bracketTypeRaw)
      : '',
    alignerTreatmentMode,
    alignerPhaseCount,
    maxillaryOrthopedicsAppliance,
  }
}

function normalizeSagittalFacialProfile(value: unknown): SagittalFacialProfile {
  if (value === 'recto' || value === 'concavo' || value === 'convexo') {
    return value
  }

  if (typeof value === 'string') {
    const normalized = value
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')

    if (normalized === 'recto') return 'recto'
    if (normalized === 'concavo') return 'concavo'
    if (normalized === 'convexo') return 'convexo'
  }

  return ''
}

function normalizeVerticalFacialType(value: unknown): VerticalFacialType {
  if (value === 'braquifacial' || value === 'mesofacial' || value === 'dolicofacial') {
    return value
  }

  if (typeof value === 'string') {
    const normalized = value
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')

    if (normalized.includes('braqui') || normalized.includes('corto')) {
      return 'braquifacial'
    }
    if (
      normalized.includes('meso') ||
      normalized.includes('normo') ||
      normalized.includes('promedio')
    ) {
      return 'mesofacial'
    }
    if (normalized.includes('dolico') || normalized.includes('largo')) {
      return 'dolicofacial'
    }
  }

  return ''
}

function normalizeFacialAnalysis(value: unknown): FacialAnalysis {
  if (typeof value === 'string') {
    return {
      sagitalProfile: normalizeSagittalFacialProfile(value),
      verticalFacialType: '',
    }
  }

  if (!value || typeof value !== 'object') {
    return createEmptyFacialAnalysis()
  }

  const v = value as Partial<FacialAnalysis>
  return {
    sagitalProfile: normalizeSagittalFacialProfile(v.sagitalProfile),
    verticalFacialType: normalizeVerticalFacialType(v.verticalFacialType),
  }
}

function parseLegacyOverjetText(text: string): OverjetAssessment {
  const normalized = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')

  if (normalized.includes('normal')) {
    return { classification: 'normal', valueMm: null }
  }

  const numberMatch = text.match(/-?\d+(?:[.,]\d+)?/)
  const parsedMm = numberMatch
    ? Math.abs(Number(numberMatch[0].replace(',', '.')))
    : null
  const valueMm =
    parsedMm != null && Number.isFinite(parsedMm) && parsedMm > 0
      ? Math.round(parsedMm * 10) / 10
      : null

  if (normalized.includes('invert') || numberMatch?.[0].startsWith('-')) {
    return { classification: 'invertido', valueMm }
  }

  if (normalized.includes('aumentad') || valueMm != null) {
    return { classification: 'aumentado', valueMm }
  }

  return createEmptyOverjetAssessment()
}

function normalizeOverjetAssessment(value: unknown, legacyText = ''): OverjetAssessment {
  if (value && typeof value === 'object' && 'classification' in value) {
    const assessment = value as Partial<OverjetAssessment>
    const classification: OverjetClassification =
      assessment.classification === 'normal' ||
      assessment.classification === 'aumentado' ||
      assessment.classification === 'invertido'
        ? assessment.classification
        : ''
    const valueMm =
      typeof assessment.valueMm === 'number' && assessment.valueMm > 0
        ? Math.round(assessment.valueMm * 10) / 10
        : null

    return {
      classification,
      valueMm: classification === 'normal' || classification === '' ? null : valueMm,
    }
  }

  if (typeof value === 'string' && value.trim()) {
    return parseLegacyOverjetText(value.trim())
  }

  if (legacyText.trim()) {
    return parseLegacyOverjetText(legacyText.trim())
  }

  return createEmptyOverjetAssessment()
}

function parseLegacyOverbiteText(text: string): OverbiteAssessment {
  const normalized = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')

  if (normalized.includes('normal')) {
    return { classification: 'normal', valueMm: null }
  }

  const numberMatch = text.match(/-?\d+(?:[.,]\d+)?/)
  const parsedMm = numberMatch
    ? Math.abs(Number(numberMatch[0].replace(',', '.')))
    : null
  const valueMm =
    parsedMm != null && Number.isFinite(parsedMm) && parsedMm > 0
      ? Math.round(parsedMm * 10) / 10
      : null

  if (
    normalized.includes('abierta') ||
    normalized.includes('open bite') ||
    numberMatch?.[0].startsWith('-')
  ) {
    return { classification: 'mordida_abierta', valueMm }
  }

  if (normalized.includes('profund') || valueMm != null) {
    return { classification: 'mordida_profunda', valueMm }
  }

  return createEmptyOverbiteAssessment()
}

function normalizeOverbiteAssessment(value: unknown, legacyText = ''): OverbiteAssessment {
  if (value && typeof value === 'object' && 'classification' in value) {
    const assessment = value as Partial<OverbiteAssessment>
    const classification: OverbiteClassification =
      assessment.classification === 'normal' ||
      assessment.classification === 'mordida_profunda' ||
      assessment.classification === 'mordida_abierta'
        ? assessment.classification
        : ''
    const valueMm =
      typeof assessment.valueMm === 'number' && assessment.valueMm > 0
        ? Math.round(assessment.valueMm * 10) / 10
        : null

    return {
      classification,
      valueMm: classification === 'normal' || classification === '' ? null : valueMm,
    }
  }

  if (typeof value === 'string' && value.trim()) {
    return parseLegacyOverbiteText(value.trim())
  }

  if (legacyText.trim()) {
    return parseLegacyOverbiteText(legacyText.trim())
  }

  return createEmptyOverbiteAssessment()
}

export function normalizeOrthodonticsAnnex(data?: Partial<OrthodonticsAnnex>): OrthodonticsAnnex {
  const midlineDeviation = isQuadrantMmValue(data?.midlineDeviation)
    ? { ...createEmptyMidlineDeviation(), ...data.midlineDeviation }
    : createEmptyMidlineDeviation()

  const crowdingSpacingAssessment = normalizeCrowdingSpacingValue(
    data?.crowdingSpacingAssessment,
  )

  const legacyMidline = data?.midline?.trim() ?? ''
  const legacyCrowding = data?.crowdingSpacing?.trim() ?? ''
  const legacyMalocclusion = data?.malocclusion?.trim() ?? ''

  const legacyOverjetOverbite = data?.overjetOverbite?.trim() ?? ''
  const legacyOverjetString = typeof data?.overjet === 'string' ? data.overjet.trim() : ''
  const legacyOverbiteString = typeof data?.overbite === 'string' ? data.overbite.trim() : ''
  const legacyOverjetValue =
    typeof data?.overjet === 'object' && data.overjet !== null ? data.overjet : undefined
  const legacyOverbiteValue =
    typeof data?.overbite === 'object' && data.overbite !== null ? data.overbite : undefined

  const malocclusionAssessment = normalizeMalocclusionAssessment(
    data?.malocclusionAssessment,
    legacyOverjetValue ?? legacyOverjetString,
    legacyOverbiteValue ?? legacyOverbiteString,
    legacyOverjetString ||
      (legacyOverjetOverbite && !legacyOverbiteString && !legacyOverbiteValue
        ? legacyOverjetOverbite
        : ''),
  )
  let legacyMalocclusionForNotes = legacyMalocclusion
  if (legacyMalocclusion && !hasMalocclusionAssessmentContent(malocclusionAssessment)) {
    malocclusionAssessment.sagitalDental = normalizeSagitalClass(legacyMalocclusion)
    legacyMalocclusionForNotes = ''
  }

  const orthodonticTreatmentPlan = normalizeOrthodonticTreatmentPlan({
    treatmentType: data?.treatmentType,
    conventionalBracketType: data?.conventionalBracketType,
    alignerTreatmentMode: data?.alignerTreatmentMode,
    alignerPhaseCount: data?.alignerPhaseCount,
    maxillaryOrthopedicsAppliance: data?.maxillaryOrthopedicsAppliance,
  })

  return {
    facialProfile: normalizeFacialAnalysis(data?.facialProfile),
    malocclusionAssessment,
    midlineDeviation,
    crowdingSpacingAssessment,
    midline: legacyMidline,
    crowdingSpacing: legacyCrowding,
    malocclusion: legacyMalocclusion,
    treatmentType: orthodonticTreatmentPlan.treatmentType,
    conventionalBracketType: orthodonticTreatmentPlan.conventionalBracketType,
    alignerTreatmentMode: orthodonticTreatmentPlan.alignerTreatmentMode,
    alignerPhaseCount: orthodonticTreatmentPlan.alignerPhaseCount,
    maxillaryOrthopedicsAppliance: orthodonticTreatmentPlan.maxillaryOrthopedicsAppliance,
    orthodonticBudget: normalizeOrthodonticBudget(data?.orthodonticBudget),
    treatmentDurationMonths: normalizeTreatmentDurationMonths(
      data?.treatmentDurationMonths,
      typeof data?.estimatedDuration === 'string' ? data.estimatedDuration : '',
    ),
    notes: mergeLegacyNotes(
      data?.notes ?? '',
      legacyMidline,
      legacyCrowding,
      legacyMalocclusionForNotes,
    ),
  }
}

function mergeLegacyNotes(
  notes: string,
  midline: string,
  crowding: string,
  malocclusion: string,
): string {
  const legacyLines = [
    midline ? `Línea media (texto previo): ${midline}` : '',
    crowding ? `Apiñamiento/espaciamiento (texto previo): ${crowding}` : '',
    malocclusion ? `Maloclusión (texto previo): ${malocclusion}` : '',
  ].filter(Boolean)

  if (legacyLines.length === 0) return notes
  return [notes, ...legacyLines].filter(Boolean).join('\n')
}

function optionLabel<T extends string>(
  value: T,
  options: readonly { value: Exclude<T, ''>; label: string }[],
): string {
  if (!value) return ''
  return options.find((option) => option.value === value)?.label ?? value
}

export function formatMalocclusionDentalSummary(
  assessment: MalocclusionAssessment,
): string {
  const overjetSummary = formatOverjetAssessment(assessment.overjet)
  const overbiteSummary = formatOverbiteAssessment(assessment.overbite)

  return [
    assessment.sagitalDental &&
      `Sagital: ${optionLabel(assessment.sagitalDental, SAGITAL_CLASS_OPTIONS)}`,
    overjetSummary && `Over Jet: ${overjetSummary}`,
    overbiteSummary && `Over Bite: ${overbiteSummary}`,
    assessment.transversalDental &&
      `Transversal: ${optionLabel(assessment.transversalDental, TRANSVERSAL_DENTAL_OPTIONS)}`,
  ]
    .filter(Boolean)
    .join(' · ')
}

export function formatMalocclusionSkeletalSummary(
  assessment: MalocclusionAssessment,
): string {
  return [
    assessment.sagitalEsqueletica &&
      `Sagital: ${optionLabel(assessment.sagitalEsqueletica, SAGITAL_CLASS_OPTIONS)}`,
    assessment.verticalEsqueletica &&
      `Vertical: ${optionLabel(assessment.verticalEsqueletica, VERTICAL_SKELETAL_OPTIONS)}`,
    assessment.transversalEsqueletica &&
      `Transversal: ${optionLabel(assessment.transversalEsqueletica, TRANSVERSAL_SKELETAL_OPTIONS)}`,
  ]
    .filter(Boolean)
    .join(' · ')
}
