export type SagittalFacialProfile = 'recto' | 'concavo' | 'convexo' | ''

/** @deprecated Usar SagittalFacialProfile */
export type FacialProfile = SagittalFacialProfile

export const SAGITTAL_FACIAL_PROFILE_OPTIONS: {
  value: Exclude<SagittalFacialProfile, ''>
  label: string
}[] = [
  { value: 'recto', label: 'Recto' },
  { value: 'concavo', label: 'Cóncavo' },
  { value: 'convexo', label: 'Convexo' },
]

/** @deprecated Usar SAGITTAL_FACIAL_PROFILE_OPTIONS */
export const FACIAL_PROFILE_OPTIONS = SAGITTAL_FACIAL_PROFILE_OPTIONS

export type VerticalFacialType = '' | 'braquifacial' | 'mesofacial' | 'dolicofacial'

export const VERTICAL_FACIAL_TYPE_OPTIONS: {
  value: Exclude<VerticalFacialType, ''>
  label: string
}[] = [
  { value: 'braquifacial', label: 'Braquifacial (Patrón Corto)' },
  { value: 'mesofacial', label: 'Mesofacial (Patrón Promedio / Normofacial)' },
  { value: 'dolicofacial', label: 'Dolicofacial (Patrón Largo)' },
]

export interface FacialAnalysis {
  sagitalProfile: SagittalFacialProfile
  verticalFacialType: VerticalFacialType
}

export function createEmptyFacialAnalysis(): FacialAnalysis {
  return {
    sagitalProfile: '',
    verticalFacialType: '',
  }
}

function sagittalProfileLabel(value: SagittalFacialProfile): string {
  if (!value) return ''
  return SAGITTAL_FACIAL_PROFILE_OPTIONS.find((option) => option.value === value)?.label ?? value
}

function verticalFacialTypeLabel(value: VerticalFacialType): string {
  if (!value) return ''
  return VERTICAL_FACIAL_TYPE_OPTIONS.find((option) => option.value === value)?.label ?? value
}

export function formatFacialAnalysis(analysis: FacialAnalysis): string {
  return [
    analysis.sagitalProfile && `Perfil sagital: ${sagittalProfileLabel(analysis.sagitalProfile)}`,
    analysis.verticalFacialType &&
      `Tipo vertical: ${verticalFacialTypeLabel(analysis.verticalFacialType)}`,
  ]
    .filter(Boolean)
    .join(' · ')
}

export type OrthodonticTreatmentType =
  | ''
  | 'convencional_brackets'
  | 'alineadores'
  | 'combinado_brackets_alineadores'
  | 'ortopedia_maxilar'
  | 'combinado_cirugia_maxilofacial'

export const ORTHODONTIC_TREATMENT_TYPE_OPTIONS: {
  value: Exclude<OrthodonticTreatmentType, ''>
  label: string
}[] = [
  {
    value: 'convencional_brackets',
    label: 'Ortodoncia Convencional con Brackets',
  },
  { value: 'alineadores', label: 'Ortodoncia con Alineadores' },
  {
    value: 'combinado_brackets_alineadores',
    label: 'Tratamiento Combinado de Ortodoncia con Brackets y Alineadores',
  },
  { value: 'ortopedia_maxilar', label: 'Ortopedia Maxilar' },
  {
    value: 'combinado_cirugia_maxilofacial',
    label: 'Tratamiento de Ortodoncia Combinado con Cirugía Maxilofacial',
  },
]

export const ORTHODONTIC_TREATMENT_TYPES_WITH_BRACKETS = [
  'convencional_brackets',
  'combinado_brackets_alineadores',
  'combinado_cirugia_maxilofacial',
] as const satisfies readonly Exclude<OrthodonticTreatmentType, ''>[]

export function orthodonticTreatmentTypeUsesBrackets(
  treatmentType: OrthodonticTreatmentType,
): treatmentType is (typeof ORTHODONTIC_TREATMENT_TYPES_WITH_BRACKETS)[number] {
  return ORTHODONTIC_TREATMENT_TYPES_WITH_BRACKETS.includes(
    treatmentType as (typeof ORTHODONTIC_TREATMENT_TYPES_WITH_BRACKETS)[number],
  )
}

export function formatOrthodonticTreatmentType(type: OrthodonticTreatmentType): string {
  if (!type) return ''
  return (
    ORTHODONTIC_TREATMENT_TYPE_OPTIONS.find((option) => option.value === type)?.label ?? type
  )
}

export type ConventionalBracketType =
  | ''
  | 'metalicos_convencionales'
  | 'autoligado'
  | 'ceramicos_transparentes'

export const CONVENTIONAL_BRACKET_TYPE_OPTIONS: {
  value: Exclude<ConventionalBracketType, ''>
  label: string
}[] = [
  { value: 'metalicos_convencionales', label: 'Brackets Metálicos Convencionales' },
  { value: 'autoligado', label: 'Brackets de Autoligado' },
  { value: 'ceramicos_transparentes', label: 'Brackets Cerámicos Transparentes' },
]

export function formatConventionalBracketType(type: ConventionalBracketType): string {
  if (!type) return ''
  return CONVENTIONAL_BRACKET_TYPE_OPTIONS.find((option) => option.value === type)?.label ?? type
}

export function formatOrthodonticTreatmentPlan(
  plan: OrthodonticTreatmentPlanSelection,
): string {
  const base = formatOrthodonticTreatmentType(plan.treatmentType)
  if (!base) return ''

  const details: string[] = []

  if (orthodonticTreatmentTypeUsesBrackets(plan.treatmentType) && plan.conventionalBracketType) {
    details.push(formatConventionalBracketType(plan.conventionalBracketType))
  }

  if (orthodonticTreatmentTypeUsesAligners(plan.treatmentType) && plan.alignerTreatmentMode) {
    details.push(formatAlignerTreatmentMode(plan.alignerTreatmentMode))
    if (plan.alignerTreatmentMode === 'por_fases' && plan.alignerPhaseCount) {
      details.push(`${plan.alignerPhaseCount} fases`)
    }
  }

  if (
    orthodonticTreatmentTypeUsesMaxillaryOrthopedics(plan.treatmentType) &&
    plan.maxillaryOrthopedicsAppliance.type
  ) {
    details.push(formatMaxillaryOrthopedicsAppliance(plan.maxillaryOrthopedicsAppliance))
  }

  if (details.length === 0) return base
  return `${base} — ${details.join(' · ')}`
}

export type MaxillaryOrthopedicsApplianceType = '' | 'superior' | 'inferior' | 'bimaxilar'

export const MAXILLARY_ORTHOPEDICS_APPLIANCE_TYPE_OPTIONS: {
  value: Exclude<MaxillaryOrthopedicsApplianceType, ''>
  label: string
}[] = [
  { value: 'superior', label: 'Aparato de Ortopedia Superior' },
  { value: 'inferior', label: 'Aparato de Ortopedia Inferior' },
  { value: 'bimaxilar', label: 'Aparato de Ortopedia Bimaxilar' },
]

export interface MaxillaryOrthopedicsAppliance {
  type: MaxillaryOrthopedicsApplianceType
  name: string
  description: string
}

export function createEmptyMaxillaryOrthopedicsAppliance(): MaxillaryOrthopedicsAppliance {
  return {
    type: '',
    name: '',
    description: '',
  }
}

export function orthodonticTreatmentTypeUsesMaxillaryOrthopedics(
  treatmentType: OrthodonticTreatmentType,
): treatmentType is 'ortopedia_maxilar' {
  return treatmentType === 'ortopedia_maxilar'
}

export function formatMaxillaryOrthopedicsApplianceType(
  type: MaxillaryOrthopedicsApplianceType,
): string {
  if (!type) return ''
  return (
    MAXILLARY_ORTHOPEDICS_APPLIANCE_TYPE_OPTIONS.find((option) => option.value === type)?.label ??
    type
  )
}

export function formatMaxillaryOrthopedicsAppliance(
  appliance: MaxillaryOrthopedicsAppliance,
): string {
  const parts = [formatMaxillaryOrthopedicsApplianceType(appliance.type)]
  if (appliance.name.trim()) parts.push(appliance.name.trim())
  if (appliance.description.trim()) parts.push(appliance.description.trim())
  return parts.filter(Boolean).join(' — ')
}

export type AlignerTreatmentMode = '' | 'una_sola_tanda' | 'por_fases'

export const ALIGNER_TREATMENT_MODE_OPTIONS: {
  value: Exclude<AlignerTreatmentMode, ''>
  label: string
}[] = [
  {
    value: 'una_sola_tanda',
    label: 'Tratamiento con Alineadores en una Sola Tanda',
  },
  {
    value: 'por_fases',
    label: 'Tratamiento con Alineadores por Fases',
  },
]

export type AlignerPhaseCount = '' | '2' | '3' | '4'

export const ALIGNER_PHASE_COUNT_OPTIONS: {
  value: Exclude<AlignerPhaseCount, ''>
  label: string
}[] = [
  { value: '2', label: '2 fases' },
  { value: '3', label: '3 fases' },
  { value: '4', label: '4 fases' },
]

export interface OrthodonticTreatmentPlanSelection {
  treatmentType: OrthodonticTreatmentType
  conventionalBracketType: ConventionalBracketType
  alignerTreatmentMode: AlignerTreatmentMode
  alignerPhaseCount: AlignerPhaseCount
  maxillaryOrthopedicsAppliance: MaxillaryOrthopedicsAppliance
}

export function orthodonticTreatmentTypeUsesAligners(
  treatmentType: OrthodonticTreatmentType,
): treatmentType is 'alineadores' {
  return treatmentType === 'alineadores'
}

export function formatAlignerTreatmentMode(mode: AlignerTreatmentMode): string {
  if (!mode) return ''
  return ALIGNER_TREATMENT_MODE_OPTIONS.find((option) => option.value === mode)?.label ?? mode
}

export function formatAlignerPhaseCount(count: AlignerPhaseCount): string {
  if (!count) return ''
  return ALIGNER_PHASE_COUNT_OPTIONS.find((option) => option.value === count)?.label ?? `${count} fases`
}

export const MIN_ORTHODONTIC_TREATMENT_DURATION_MONTHS = 2
export const MAX_ORTHODONTIC_TREATMENT_DURATION_MONTHS = 36

export type OrthodonticTreatmentDurationMonths = number | null

export function getOrthodonticTreatmentDurationMonthOptions(): number[] {
  return Array.from(
    { length: MAX_ORTHODONTIC_TREATMENT_DURATION_MONTHS - MIN_ORTHODONTIC_TREATMENT_DURATION_MONTHS + 1 },
    (_, index) => index + MIN_ORTHODONTIC_TREATMENT_DURATION_MONTHS,
  )
}

export function formatOrthodonticTreatmentDurationMonths(
  months: OrthodonticTreatmentDurationMonths,
): string {
  if (months == null || months < MIN_ORTHODONTIC_TREATMENT_DURATION_MONTHS) return ''
  if (months > MAX_ORTHODONTIC_TREATMENT_DURATION_MONTHS) return ''
  return `${months} meses`
}

export interface MidlineDeviationValue {
  supDerecha: number
  supIzquierda: number
  infDerecha: number
  infIzquierda: number
}

export interface CrowdingSpacingValue {
  supDerecha: number
  supIzquierda: number
  infDerecha: number
  infIzquierda: number
}

export type SagitalClass = '' | 'I' | 'II' | 'III'

export const SAGITAL_CLASS_OPTIONS: { value: Exclude<SagitalClass, ''>; label: string }[] = [
  { value: 'I', label: 'Clase I' },
  { value: 'II', label: 'Clase II' },
  { value: 'III', label: 'Clase III' },
]

export type VerticalDentalType = '' | 'mordida_abierta' | 'mordida_profunda' | 'normal'

export const VERTICAL_DENTAL_OPTIONS: {
  value: Exclude<VerticalDentalType, ''>
  label: string
}[] = [
  { value: 'mordida_abierta', label: 'Mordida abierta' },
  { value: 'mordida_profunda', label: 'Mordida profunda' },
  { value: 'normal', label: 'Normal' },
]

export type VerticalSkeletalType =
  | ''
  | 'hiperdivergente'
  | 'normodivergente'
  | 'hipodivergente'

export const VERTICAL_SKELETAL_OPTIONS: {
  value: Exclude<VerticalSkeletalType, ''>
  label: string
}[] = [
  { value: 'hiperdivergente', label: 'Hiperdivergente' },
  { value: 'normodivergente', label: 'Normodivergente' },
  { value: 'hipodivergente', label: 'Hipodivergente' },
]

export type TransversalDentalType =
  | ''
  | 'mordida_cruzada_bilateral'
  | 'mordida_cruzada_unilateral_derecha'
  | 'mordida_cruzada_unilateral_izquierda'

export const TRANSVERSAL_DENTAL_OPTIONS: {
  value: Exclude<TransversalDentalType, ''>
  label: string
}[] = [
  { value: 'mordida_cruzada_bilateral', label: 'Mordida cruzada bilateral' },
  {
    value: 'mordida_cruzada_unilateral_derecha',
    label: 'Mordida cruzada unilateral derecha',
  },
  {
    value: 'mordida_cruzada_unilateral_izquierda',
    label: 'Mordida cruzada unilateral izquierda',
  },
]

export type TransversalSkeletalType =
  | ''
  | 'desviacion_esqueletica_derecha'
  | 'desviacion_esqueletica_izquierda'

export const TRANSVERSAL_SKELETAL_OPTIONS: {
  value: Exclude<TransversalSkeletalType, ''>
  label: string
}[] = [
  {
    value: 'desviacion_esqueletica_derecha',
    label: 'Desviación esquelética a la derecha',
  },
  {
    value: 'desviacion_esqueletica_izquierda',
    label: 'Desviación esquelética a la izquierda',
  },
]

export interface MalocclusionAssessment {
  sagitalDental: SagitalClass
  sagitalEsqueletica: SagitalClass
  /** Sobremordida horizontal (Over Jet) */
  overjet: OverjetAssessment
  /** Sobremordida vertical (Over Bite) */
  overbite: OverbiteAssessment
  verticalEsqueletica: VerticalSkeletalType
  transversalDental: TransversalDentalType
  transversalEsqueletica: TransversalSkeletalType
}

export const SAGITAL_MALOCCLUSION_FIELDS: {
  key: 'sagitalDental' | 'sagitalEsqueletica'
  label: string
}[] = [
  { key: 'sagitalDental', label: 'Maloclusión sagital dental' },
  { key: 'sagitalEsqueletica', label: 'Maloclusión sagital esquelética' },
]

export function createEmptyMalocclusionAssessment(): MalocclusionAssessment {
  return {
    sagitalDental: '',
    sagitalEsqueletica: '',
    overjet: createEmptyOverjetAssessment(),
    overbite: createEmptyOverbiteAssessment(),
    verticalEsqueletica: '',
    transversalDental: '',
    transversalEsqueletica: '',
  }
}

export function createEmptyMidlineDeviation(): MidlineDeviationValue {
  return {
    supDerecha: 0,
    supIzquierda: 0,
    infDerecha: 0,
    infIzquierda: 0,
  }
}

export function createEmptyCrowdingSpacingValue(): CrowdingSpacingValue {
  return {
    supDerecha: 0,
    supIzquierda: 0,
    infDerecha: 0,
    infIzquierda: 0,
  }
}

export type OverjetClassification = '' | 'normal' | 'aumentado' | 'invertido'

export const OVERJET_CLASSIFICATION_OPTIONS: {
  value: Exclude<OverjetClassification, ''>
  label: string
}[] = [
  { value: 'normal', label: 'Normal' },
  { value: 'aumentado', label: 'Aumentado' },
  { value: 'invertido', label: 'Invertido' },
]

export interface OverjetAssessment {
  classification: OverjetClassification
  /** Magnitud en mm (positiva); en invertido se registra con signo negativo al exportar */
  valueMm: number | null
}

export function createEmptyOverjetAssessment(): OverjetAssessment {
  return {
    classification: '',
    valueMm: null,
  }
}

export function formatOverjetAssessment(assessment: OverjetAssessment): string {
  if (assessment.classification === 'normal') return 'Normal'
  if (!assessment.classification) return ''
  if (assessment.valueMm == null) {
    return assessment.classification === 'aumentado' ? 'Aumentado' : 'Invertido'
  }
  if (assessment.classification === 'aumentado') {
    return `Aumentado: ${assessment.valueMm} mm`
  }
  return `Invertido: -${assessment.valueMm} mm`
}

export function getOverjetSignedValueMm(assessment: OverjetAssessment): number | null {
  if (assessment.valueMm == null) return null
  if (assessment.classification === 'invertido') return -assessment.valueMm
  if (assessment.classification === 'aumentado') return assessment.valueMm
  return null
}

export type OverbiteClassification = '' | 'normal' | 'mordida_profunda' | 'mordida_abierta'

export const OVERBITE_CLASSIFICATION_OPTIONS: {
  value: Exclude<OverbiteClassification, ''>
  label: string
}[] = [
  { value: 'normal', label: 'Normal' },
  { value: 'mordida_profunda', label: 'Mordida Profunda' },
  { value: 'mordida_abierta', label: 'Mordida Abierta' },
]

export interface OverbiteAssessment {
  classification: OverbiteClassification
  /** Magnitud en mm (positiva); en mordida abierta se exporta con signo negativo */
  valueMm: number | null
}

export function createEmptyOverbiteAssessment(): OverbiteAssessment {
  return {
    classification: '',
    valueMm: null,
  }
}

export function formatOverbiteAssessment(assessment: OverbiteAssessment): string {
  if (assessment.classification === 'normal') return 'Normal'
  if (!assessment.classification) return ''
  if (assessment.valueMm == null) {
    return assessment.classification === 'mordida_profunda'
      ? 'Mordida Profunda'
      : 'Mordida Abierta'
  }
  if (assessment.classification === 'mordida_profunda') {
    return `Mordida Profunda: ${assessment.valueMm} mm`
  }
  return `Mordida Abierta: -${assessment.valueMm} mm`
}

export function getOverbiteSignedValueMm(assessment: OverbiteAssessment): number | null {
  if (assessment.valueMm == null) return null
  if (assessment.classification === 'mordida_abierta') return -assessment.valueMm
  if (assessment.classification === 'mordida_profunda') return assessment.valueMm
  return null
}
