/** Examen estomatológico / físico — habilitación Res. 3100 de 2019 */

export interface VitalSignsExam {
  /** Presión arterial sistólica (mmHg) */
  systolicPressure: number | null
  /** Presión arterial diastólica (mmHg) */
  diastolicPressure: number | null
  /** Frecuencia cardíaca (lpm) */
  heartRate: number | null
  /** Valores dentro de parámetros normales de referencia */
  isNormal: boolean
  /** Observaciones si hay alteración o criterio clínico adicional */
  notes: string
}

/** Valores de referencia al usar el atajo "Normal" */
export const NORMAL_VITAL_SIGNS_PRESET = {
  systolicPressure: 120,
  diastolicPressure: 80,
  heartRate: 72,
} as const

/** Rangos de referencia clínica para filtro de seguridad perioperatorio */
export const VITAL_SIGNS_NORMAL_RANGES = {
  systolic: { min: 90, max: 129 },
  diastolic: { min: 60, max: 84 },
  heartRate: { min: 60, max: 100 },
} as const

export function isVitalSignsWithinNormalRange(
  systolicPressure: number | null,
  diastolicPressure: number | null,
  heartRate: number | null,
): boolean {
  if (systolicPressure === null || diastolicPressure === null || heartRate === null) {
    return false
  }

  const { systolic, diastolic, heartRate: hr } = VITAL_SIGNS_NORMAL_RANGES

  return (
    systolicPressure >= systolic.min &&
    systolicPressure <= systolic.max &&
    diastolicPressure >= diastolic.min &&
    diastolicPressure <= diastolic.max &&
    heartRate >= hr.min &&
    heartRate <= hr.max
  )
}

export function createNormalVitalSignsExam(): VitalSignsExam {
  return {
    ...NORMAL_VITAL_SIGNS_PRESET,
    isNormal: true,
    notes: '',
  }
}

export function createEmptyVitalSignsExam(): VitalSignsExam {
  return {
    systolicPressure: null,
    diastolicPressure: null,
    heartRate: null,
    isNormal: false,
    notes: '',
  }
}

export function normalizeVitalSignsExam(data?: Partial<VitalSignsExam>): VitalSignsExam {
  const empty = createEmptyVitalSignsExam()

  const parsePressure = (value: unknown): number | null => {
    if (value === null || value === undefined || value === '') return null
    const parsed = typeof value === 'number' ? value : Number(value)
    return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null
  }

  const systolicPressure = parsePressure(data?.systolicPressure)
  const diastolicPressure = parsePressure(data?.diastolicPressure)
  const heartRate = parsePressure(data?.heartRate)
  const withinRange = isVitalSignsWithinNormalRange(
    systolicPressure,
    diastolicPressure,
    heartRate,
  )

  return {
    systolicPressure,
    diastolicPressure,
    heartRate,
    isNormal: data?.isNormal === true && withinRange,
    notes: typeof data?.notes === 'string' ? data.notes : empty.notes,
  }
}

export function formatVitalSignsSummary(vitalSigns: VitalSignsExam): string {
  const { systolicPressure, diastolicPressure, heartRate, isNormal, notes } = vitalSigns

  if (systolicPressure === null && diastolicPressure === null && heartRate === null) {
    return ''
  }

  const parts: string[] = []

  if (systolicPressure !== null && diastolicPressure !== null) {
    parts.push(`PA ${systolicPressure}/${diastolicPressure} mmHg`)
  } else if (systolicPressure !== null) {
    parts.push(`PA sistólica ${systolicPressure} mmHg`)
  } else if (diastolicPressure !== null) {
    parts.push(`PA diastólica ${diastolicPressure} mmHg`)
  }

  if (heartRate !== null) {
    parts.push(`FC ${heartRate} lpm`)
  }

  parts.push(isNormal ? 'Dentro de parámetros normales' : 'Fuera de parámetros de referencia')

  if (notes.trim()) {
    parts.push(`Notas: ${notes.trim()}`)
  }

  return parts.join(' · ')
}

export interface ExamField {
  isNormal: boolean
  description: string
}

export interface ExamCie10Link {
  code: string
  description: string
}

export type ExamFindingCie10Map = Record<string, ExamCie10Link>

export function getExamFindingCie10(
  map: ExamFindingCie10Map,
  key: string,
): ExamCie10Link | null {
  return map[key] ?? null
}

export function setExamFindingCie10(
  map: ExamFindingCie10Map,
  key: string,
  link: ExamCie10Link | null,
): ExamFindingCie10Map {
  const next = { ...map }
  if (link) next[key] = link
  else delete next[key]
  return next
}

export function clearExamFindingCie10ByPrefix(
  map: ExamFindingCie10Map,
  prefix: string,
): ExamFindingCie10Map {
  const next = { ...map }
  for (const key of Object.keys(next)) {
    if (key.startsWith(prefix)) delete next[key]
  }
  return next
}

export function normalizeExamCie10Link(value: unknown): ExamCie10Link | null {
  if (!value || typeof value !== 'object') return null
  const link = value as Partial<ExamCie10Link>
  const code = typeof link.code === 'string' ? link.code.trim() : ''
  const description = typeof link.description === 'string' ? link.description.trim() : ''
  if (!code || !description) return null
  return { code, description }
}

export function normalizeExamFindingCie10Map(data?: Record<string, unknown>): ExamFindingCie10Map {
  if (!data || typeof data !== 'object') return {}
  const normalized: ExamFindingCie10Map = {}
  for (const [key, value] of Object.entries(data)) {
    const link = normalizeExamCie10Link(value)
    if (link) normalized[key] = link
  }
  return normalized
}

export function formatExamFindingCie10Suffix(link: ExamCie10Link | null | undefined): string {
  if (!link) return ''
  return ` (CIE-10 ${link.code}: ${link.description})`
}

export type AtmLaterality = '' | 'derecha' | 'izquierda' | 'bilateral'

export const ATM_LATERALITY_OPTIONS: {
  value: Exclude<AtmLaterality, ''>
  label: string
}[] = [
  { value: 'derecha', label: 'Derecha' },
  { value: 'izquierda', label: 'Izquierda' },
  { value: 'bilateral', label: 'Bilateral' },
]

export type AtmDeviationMovement = '' | 'apertura' | 'cierre'

export const ATM_DEVIATION_MOVEMENT_OPTIONS: {
  value: Exclude<AtmDeviationMovement, ''>
  label: string
}[] = [
  { value: 'apertura', label: 'Movimiento de apertura' },
  { value: 'cierre', label: 'Movimiento de cierre' },
]

export interface AtmExam {
  isNormal: boolean
  clicks: AtmLaterality
  pain: AtmLaterality
  deviation: AtmDeviationMovement
  notes: string
}

export interface SoftTissuesExam {
  lips: ExamField
  cheeks: ExamField
  tongue: ExamField
  floorOfMouth: ExamField
  hardPalate: ExamField
  softPalate: ExamField
  tonsils: ExamField
  salivaryGlands: ExamField
}

export type AngleClass = 'I' | 'II' | 'III' | 'no_evaluado'

export const ANGLE_CLASS_OPTIONS: { value: AngleClass; label: string }[] = [
  { value: 'no_evaluado', label: 'No aplica' },
  { value: 'I', label: 'Clase I' },
  { value: 'II', label: 'Clase II' },
  { value: 'III', label: 'Clase III' },
]

export type CrossbiteType =
  | 'anterior'
  | 'posterior_bilateral'
  | 'posterior_derecha'
  | 'posterior_izquierda'

export const CROSSBITE_TYPE_OPTIONS: { value: CrossbiteType; label: string }[] = [
  { value: 'anterior', label: 'Anterior' },
  { value: 'posterior_bilateral', label: 'Posterior bilateral' },
  { value: 'posterior_derecha', label: 'Posterior derecha' },
  { value: 'posterior_izquierda', label: 'Posterior izquierda' },
]

export interface OcclusionExam {
  isNormal: boolean
  molarRight: AngleClass
  molarLeft: AngleClass
  canineLeft: AngleClass
  canineRight: AngleClass
  crossbite: boolean
  crossbiteType: CrossbiteType | null
  openbite: boolean
  deepBite: boolean
  notes: string
}

/** @deprecated Campo legacy — solo para migración desde angleClass único */
interface LegacyOcclusionExam extends Partial<OcclusionExam> {
  angleClass?: AngleClass
}

export type OralHygieneLevel = '' | 'buena' | 'regular' | 'deficiente'

export type PeriodontiumYesNo = '' | 'si' | 'no'

export const ORAL_HYGIENE_OPTIONS: {
  value: Exclude<OralHygieneLevel, ''>
  label: string
}[] = [
  { value: 'buena', label: 'Buena' },
  { value: 'regular', label: 'Regular' },
  { value: 'deficiente', label: 'Deficiente' },
]

export const PERIODONTIUM_YES_NO_OPTIONS: {
  value: Exclude<PeriodontiumYesNo, ''>
  label: string
}[] = [
  { value: 'si', label: 'Sí' },
  { value: 'no', label: 'No' },
]

export interface PlaqueCalculusAssessment {
  hygiene: OralHygieneLevel
  calculusPresent: PeriodontiumYesNo
}

export interface InflammationBleedingAssessment {
  bleedingOnBrushing: PeriodontiumYesNo
  bleedingOnProbing: PeriodontiumYesNo
  erythema: PeriodontiumYesNo
  edema: PeriodontiumYesNo
}

export interface DentalMobilityAssessment {
  present: PeriodontiumYesNo
  affectedTeeth: string
}

export type GingivitisType = '' | 'cronica' | 'aguda'

export const GINGIVITIS_TYPE_OPTIONS: {
  value: Exclude<GingivitisType, ''>
  label: string
}[] = [
  { value: 'cronica', label: 'Crónica' },
  { value: 'aguda', label: 'Aguda' },
]

export interface GingivitisAssessment {
  present: PeriodontiumYesNo
  type: GingivitisType
}

export interface PeriodontiumExam {
  isNormal: boolean
  plaqueCalculus: PlaqueCalculusAssessment
  inflammationBleeding: InflammationBleedingAssessment
  gingivitis: GingivitisAssessment
  mobility: DentalMobilityAssessment
  notes: string
}

/** @deprecated Campos legacy del examen de periodonto */
interface LegacyPeriodontiumExam {
  isNormal?: boolean
  plaqueCalculus?: Partial<PlaqueCalculusAssessment>
  inflammationBleeding?: Partial<InflammationBleedingAssessment>
  gingivitis?: Partial<GingivitisAssessment>
  mobility?: DentalMobilityAssessment | ExamField | unknown
  notes?: string
  plaqueIndex?: ExamField | unknown
  bleedingIndex?: ExamField | unknown
}

export interface StomatologicalExam {
  /** Signos vitales y estado general — filtro de seguridad legal pre-procedimiento */
  vitalSigns: VitalSignsExam
  atm: AtmExam
  softTissues: SoftTissuesExam
  occlusion: OcclusionExam
  periodontium: PeriodontiumExam
  /** Códigos CIE-10 asociados a hallazgos del examen (clave por ruta, ej. softTissues.lips) */
  findingCie10: ExamFindingCie10Map
}

export function createExamField(): ExamField {
  return { isNormal: false, description: '' }
}

export function createEmptyStomatologicalExam(): StomatologicalExam {
  return {
    vitalSigns: createEmptyVitalSignsExam(),
    atm: { isNormal: false, clicks: '', pain: '', deviation: '', notes: '' },
    softTissues: {
      lips: createExamField(),
      cheeks: createExamField(),
      tongue: createExamField(),
      floorOfMouth: createExamField(),
      hardPalate: createExamField(),
      softPalate: createExamField(),
      tonsils: createExamField(),
      salivaryGlands: createExamField(),
    },
    occlusion: {
      isNormal: false,
      molarRight: 'no_evaluado',
      molarLeft: 'no_evaluado',
      canineLeft: 'no_evaluado',
      canineRight: 'no_evaluado',
      crossbite: false,
      crossbiteType: null,
      openbite: false,
      deepBite: false,
      notes: '',
    },
    periodontium: {
      isNormal: false,
      plaqueCalculus: { hygiene: '', calculusPresent: '' },
      inflammationBleeding: {
        bleedingOnBrushing: '',
        bleedingOnProbing: '',
        erythema: '',
        edema: '',
      },
      gingivitis: { present: '', type: '' },
      mobility: { present: '', affectedTeeth: '' },
      notes: '',
    },
    findingCie10: {},
  }
}

/** Migra datos guardados con formato anterior (string plano) */
export function normalizeExamField(value: unknown): ExamField {
  if (value && typeof value === 'object' && 'isNormal' in value && 'description' in value) {
    return value as ExamField
  }
  const text = typeof value === 'string' ? value : ''
  const isNormal = text.toLowerCase() === 'normal' || text === ''
  return { isNormal, description: text }
}

function normalizeAtmLaterality(value: unknown): AtmLaterality {
  if (value === 'derecha' || value === 'izquierda' || value === 'bilateral') {
    return value
  }

  if (value === true) return 'bilateral'

  if (typeof value === 'string') {
    const normalized = value
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')

    if (normalized.includes('bilateral')) return 'bilateral'
    if (normalized.includes('derecha')) return 'derecha'
    if (normalized.includes('izquierda')) return 'izquierda'
  }

  return ''
}

function normalizeAtmDeviationMovement(value: unknown): AtmDeviationMovement {
  if (value === 'apertura' || value === 'cierre') return value

  if (typeof value === 'string') {
    const normalized = value
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')

    if (normalized.includes('apertura')) return 'apertura'
    if (normalized.includes('cierre')) return 'cierre'
  }

  return ''
}

function normalizeAtmNotes(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value.trim() === 'Sin alteraciones' ? '' : value
}

function normalizePeriodontiumYesNo(value: unknown): PeriodontiumYesNo {
  if (value === 'si' || value === 'no') return value
  if (value === true) return 'si'
  if (value === false) return 'no'

  if (typeof value === 'string') {
    const normalized = value
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')

    if (normalized === 'si' || normalized === 'sí' || normalized.includes('presente')) {
      return 'si'
    }
    if (
      normalized === 'no' ||
      normalized.includes('ausente') ||
      normalized === 'normal' ||
      normalized.includes('grado 0')
    ) {
      return 'no'
    }
  }

  return ''
}

function normalizeOralHygieneLevel(value: unknown): OralHygieneLevel {
  if (value === 'buena' || value === 'regular' || value === 'deficiente') return value

  if (typeof value === 'string') {
    const normalized = value
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')

    if (normalized.includes('deficiente') || normalized.includes('mala')) return 'deficiente'
    if (normalized.includes('regular') || normalized.includes('moderada')) return 'regular'
    if (normalized.includes('buena') || normalized.includes('normal')) return 'buena'
  }

  return ''
}

function legacyExamFieldText(value: unknown): string {
  const field = normalizeExamField(value)
  return field.description.trim()
}

function normalizePlaqueCalculusAssessment(
  value: unknown,
  legacyPlaqueIndex?: unknown,
): PlaqueCalculusAssessment {
  const empty = createEmptyStomatologicalExam().periodontium.plaqueCalculus

  if (value && typeof value === 'object') {
    const v = value as Partial<PlaqueCalculusAssessment>
    return {
      hygiene: normalizeOralHygieneLevel(v.hygiene),
      calculusPresent: normalizePeriodontiumYesNo(v.calculusPresent),
    }
  }

  const legacyText = legacyExamFieldText(legacyPlaqueIndex).toLowerCase()
  if (!legacyText) return empty

  return {
    hygiene: normalizeOralHygieneLevel(legacyText),
    calculusPresent: legacyText.includes('calculo') || legacyText.includes('tartaro')
      ? 'si'
      : '',
  }
}

function normalizeInflammationBleedingAssessment(
  value: unknown,
  legacyBleedingIndex?: unknown,
): InflammationBleedingAssessment {
  const empty = createEmptyStomatologicalExam().periodontium.inflammationBleeding

  if (value && typeof value === 'object') {
    const v = value as Partial<InflammationBleedingAssessment>
    return {
      bleedingOnBrushing: normalizePeriodontiumYesNo(v.bleedingOnBrushing),
      bleedingOnProbing: normalizePeriodontiumYesNo(v.bleedingOnProbing),
      erythema: normalizePeriodontiumYesNo(v.erythema),
      edema: normalizePeriodontiumYesNo(v.edema),
    }
  }

  const legacyText = legacyExamFieldText(legacyBleedingIndex).toLowerCase()
  if (!legacyText) return empty

  const hasBleeding =
    legacyText.includes('sangr') ||
    legacyText.includes('bleed') ||
    legacyText.includes('%')

  return {
    bleedingOnBrushing: hasBleeding ? 'si' : '',
    bleedingOnProbing: hasBleeding ? 'si' : '',
    erythema: legacyText.includes('eritema') ? 'si' : '',
    edema: legacyText.includes('edema') ? 'si' : '',
  }
}

function normalizeDentalMobilityAssessment(
  value: unknown,
  legacyMobility?: unknown,
): DentalMobilityAssessment {
  const empty = createEmptyStomatologicalExam().periodontium.mobility

  if (value && typeof value === 'object' && 'present' in value) {
    const v = value as Partial<DentalMobilityAssessment>
    const present = normalizePeriodontiumYesNo(v.present)
    return {
      present,
      affectedTeeth: present === 'si' ? (v.affectedTeeth ?? '').trim() : '',
    }
  }

  const legacyField = normalizeExamField(legacyMobility ?? value)
  const legacyText = legacyField.description.trim()
  if (!legacyText) return empty

  const normalized = legacyText
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')

  const present =
    legacyField.isNormal ||
    normalized === 'normal' ||
    normalized.includes('grado 0') ||
    normalized === '0'
      ? 'no'
      : 'si'

  return {
    present,
    affectedTeeth: present === 'si' ? legacyText : '',
  }
}

function normalizeGingivitisType(value: unknown): GingivitisType {
  if (value === 'cronica' || value === 'aguda') return value

  if (typeof value === 'string') {
    const normalized = value
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')

    if (normalized.includes('cronica')) return 'cronica'
    if (normalized.includes('aguda')) return 'aguda'
  }

  return ''
}

function normalizeGingivitisAssessment(value: unknown): GingivitisAssessment {
  const empty = createEmptyStomatologicalExam().periodontium.gingivitis

  if (value && typeof value === 'object') {
    const v = value as Partial<GingivitisAssessment>
    const present = normalizePeriodontiumYesNo(v.present)
    return {
      present,
      type: present === 'si' ? normalizeGingivitisType(v.type) : '',
    }
  }

  return empty
}

function normalizePeriodontiumNotes(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value.trim() === 'Sin alteraciones periodontales' ? '' : value
}

function normalizePeriodontiumExam(data: LegacyPeriodontiumExam | undefined): PeriodontiumExam {
  const empty = createEmptyStomatologicalExam().periodontium
  const legacyMobility =
    data?.mobility &&
    typeof data.mobility === 'object' &&
    !('present' in data.mobility)
      ? data.mobility
      : undefined

  return {
    ...empty,
    ...data,
    isNormal: data?.isNormal ?? false,
    plaqueCalculus: normalizePlaqueCalculusAssessment(
      data?.plaqueCalculus,
      data?.plaqueIndex,
    ),
    inflammationBleeding: normalizeInflammationBleedingAssessment(
      data?.inflammationBleeding,
      data?.bleedingIndex,
    ),
    gingivitis: normalizeGingivitisAssessment(data?.gingivitis),
    mobility: normalizeDentalMobilityAssessment(data?.mobility, legacyMobility),
    notes: normalizePeriodontiumNotes(data?.notes),
  }
}

export function normalizeStomatologicalExam(data: Partial<StomatologicalExam>): StomatologicalExam {
  const empty = createEmptyStomatologicalExam()
  const st = data.softTissues as Record<string, unknown> | undefined

  return {
    vitalSigns: normalizeVitalSignsExam(data.vitalSigns),
    atm: {
      ...empty.atm,
      ...data.atm,
      isNormal: data.atm?.isNormal ?? false,
      clicks: normalizeAtmLaterality(data.atm?.clicks),
      pain: normalizeAtmLaterality(data.atm?.pain),
      deviation: normalizeAtmDeviationMovement(data.atm?.deviation),
      notes: normalizeAtmNotes(data.atm?.notes),
    },
    softTissues: {
      lips: normalizeExamField(st?.lips),
      cheeks: normalizeExamField(st?.cheeks),
      tongue: normalizeExamField(st?.tongue),
      floorOfMouth: normalizeExamField(st?.floorOfMouth),
      hardPalate: normalizeExamField(st?.hardPalate),
      softPalate: normalizeExamField(st?.softPalate),
      tonsils: normalizeExamField(st?.tonsils),
      salivaryGlands: normalizeExamField(st?.salivaryGlands),
    },
    occlusion: normalizeOcclusionExam(data.occlusion),
    periodontium: normalizePeriodontiumExam(
      data.periodontium as LegacyPeriodontiumExam | undefined,
    ),
    findingCie10: normalizeExamFindingCie10Map(
      data.findingCie10 as Record<string, unknown> | undefined,
    ),
  }
}

function normalizeAngleClass(value: unknown): AngleClass {
  if (value === 'I' || value === 'II' || value === 'III' || value === 'no_evaluado') {
    return value
  }
  return 'no_evaluado'
}

function normalizeCrossbiteType(value: unknown): CrossbiteType | null {
  if (
    value === 'anterior' ||
    value === 'posterior_bilateral' ||
    value === 'posterior_derecha' ||
    value === 'posterior_izquierda'
  ) {
    return value
  }
  return null
}

function normalizeOcclusionExam(data: LegacyOcclusionExam | undefined): OcclusionExam {
  const empty = createEmptyStomatologicalExam().occlusion
  const legacyClass = normalizeAngleClass(data?.angleClass)
  const crossbite = data?.crossbite ?? false

  return {
    ...empty,
    ...data,
    isNormal: data?.isNormal ?? false,
    molarRight: normalizeAngleClass(data?.molarRight ?? legacyClass),
    molarLeft: normalizeAngleClass(data?.molarLeft ?? legacyClass),
    canineLeft: normalizeAngleClass(data?.canineLeft ?? legacyClass),
    canineRight: normalizeAngleClass(data?.canineRight ?? legacyClass),
    crossbite,
    crossbiteType: crossbite ? normalizeCrossbiteType(data?.crossbiteType) ?? 'anterior' : null,
    openbite: data?.openbite ?? false,
    deepBite: data?.deepBite ?? false,
    notes: data?.notes ?? '',
  }
}

export const ANGLE_OCCLUSION_FIELD_LABELS: {
  key: 'molarRight' | 'molarLeft' | 'canineLeft' | 'canineRight'
  label: string
}[] = [
  { key: 'molarRight', label: 'Clase Angle Molar Derecha' },
  { key: 'molarLeft', label: 'Clase Angle Molar Izquierda' },
  { key: 'canineLeft', label: 'Clase Angle Canina Izquierda' },
  { key: 'canineRight', label: 'Clase Angle Canina Derecha' },
]

export const SOFT_TISSUE_FIELD_LABELS: {
  key: keyof SoftTissuesExam
  label: string
}[] = [
  { key: 'lips', label: 'Labios' },
  { key: 'cheeks', label: 'Carrillos' },
  { key: 'tongue', label: 'Lengua' },
  { key: 'floorOfMouth', label: 'Piso De Boca' },
  { key: 'hardPalate', label: 'Paladar Duro' },
  { key: 'softPalate', label: 'Paladar Blando' },
  { key: 'tonsils', label: 'Amígdalas' },
  { key: 'salivaryGlands', label: 'Glándulas Salivales' },
]
