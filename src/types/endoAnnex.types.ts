/** Anexo de Endodoncia — tipos de dominio */

export type EndoComplexityLevel = 'Simple' | 'Moderado' | 'Complejo'

export type ConductometryMethod = 'EAL' | 'RX' | 'Mixed'

export type ClinicalTestResult = 'positive' | 'negative' | ''

export interface CanalMeasurement {
  canalName: string
  workingLength: number
  method: ConductometryMethod | ''
  referencePoint: string
}

export interface EndoClinicalTests {
  thermalCold: ClinicalTestResult
  thermalPersistentPain: boolean
  percussion: ClinicalTestResult
  palpation: ClinicalTestResult
}

export type EndoRadiographicFindingKey =
  | 'normal'
  | 'periapical_lesion'
  | 'widened_pdl'
  | 'caries_near_pulp'
  | 'pulp_calcification'
  | 'root_curvature'
  | 'internal_resorption'
  | 'external_resorption'
  | 'root_fracture'
  | 'open_apex'
  | 'previous_endodontics'
  | 'periapical_radiopacity'

export interface EndoRadiographicFindings {
  selected: EndoRadiographicFindingKey[]
  notes: string
}

export interface EndoDiagnosisEntry {
  code: string
  description: string
}

export interface EndoToothBudgetLine {
  toothNumber: number
  unitPrice: number
}

export interface EndodonticBudgetState {
  /** Incluir en el presupuesto general de la historia clínica */
  active: boolean
  toothLines: EndoToothBudgetLine[]
  notes: string
}

export interface EndoAnnexData {
  toothNumber: number | null
  isRetreatment: boolean
  clinicalTests: EndoClinicalTests
  radiographicFindings: EndoRadiographicFindings
  canals: CanalMeasurement[]
  diagnosis: EndoDiagnosisEntry[]
  complexityLevel: EndoComplexityLevel | ''
  budget: EndodonticBudgetState | null
  notes: string
  updatedAt: string
  specialistId: string
}

export const ENDO_COMPLEXITY_OPTIONS: { value: EndoComplexityLevel; label: string }[] = [
  { value: 'Simple', label: 'Simple' },
  { value: 'Moderado', label: 'Moderado' },
  { value: 'Complejo', label: 'Complejo' },
]

export const CONDUCTOMETRY_METHOD_OPTIONS: { value: ConductometryMethod; label: string }[] = [
  { value: 'EAL', label: 'EAL' },
  { value: 'RX', label: 'RX' },
  { value: 'Mixed', label: 'Mixto' },
]

export const ENDO_REFERENCE_POINT_OPTIONS = [
  'Cúspide',
  'Borde incisal',
  'Línea amelocementaria',
  'Corona provisional',
  'Otro',
] as const

export const ENDO_FDI_TEETH = [
  18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28,
  48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38,
] as const

export const NECROSIS_CIE10_CODES = new Set(['K04.1', 'K04.2'])

export const ENDO_RADIOGRAPHIC_FINDING_OPTIONS: {
  value: EndoRadiographicFindingKey
  label: string
}[] = [
  { value: 'normal', label: 'Sin hallazgos relevantes' },
  { value: 'periapical_lesion', label: 'Lesión periapical' },
  { value: 'widened_pdl', label: 'Ensanchamiento del LPD' },
  { value: 'caries_near_pulp', label: 'Caries próxima a pulpa' },
  { value: 'pulp_calcification', label: 'Calcificación pulpar' },
  { value: 'root_curvature', label: 'Curvatura radicular marcada' },
  { value: 'internal_resorption', label: 'Reabsorción interna' },
  { value: 'external_resorption', label: 'Reabsorción externa' },
  { value: 'root_fracture', label: 'Fractura radicular' },
  { value: 'open_apex', label: 'Ápice abierto' },
  { value: 'previous_endodontics', label: 'Endodoncia previa' },
  { value: 'periapical_radiopacity', label: 'Radiopacidad periapical' },
]
