import type { ToothNumber } from '@/types/odontogram'

/** Sitios clínicos de sondaje (6 por diente) */
export type PeriodontalSiteKey =
  | 'mesiovestibular'
  | 'vestibular'
  | 'distovestibular'
  | 'mesiolingual'
  | 'lingual'
  | 'distolingual'

export type ToothClinicalStatus =
  | 'presente'
  | 'ausente'
  | 'implante'
  | 'corona'
  | 'retenido'

export type MobilityGrade = 0 | 1 | 2 | 3
export type FurcationGrade = '0' | 'I' | 'II' | 'III'

export type PeriodontalStaging = '' | 'I' | 'II' | 'III' | 'IV'
export type PeriodontalGrading = '' | 'A' | 'B' | 'C'
export type PeriodontalExtent = '' | 'localizada' | 'generalizada' | 'gingivitis'

export type PeriodontalTreatmentPhase = 'fase_i' | 'fase_ii' | 'fase_iii'
export type PeriodontalTreatmentStatus = 'pendiente' | 'en_progreso' | 'completado'

export interface PeriodontalSiteRecord {
  pbs: number | null
  mg: number | null
  bop: boolean
  plaque: boolean
}

export interface PeriodontalToothRecord {
  number: ToothNumber
  clinicalStatus: ToothClinicalStatus
  mobility: MobilityGrade
  furcation: FurcationGrade
  sites: Record<PeriodontalSiteKey, PeriodontalSiteRecord>
}

export interface PeriodontalDiagnosis {
  staging: PeriodontalStaging
  grading: PeriodontalGrading
  extent: PeriodontalExtent
  clinicalObservations: string
  systemicRiskFactors: string
}

export interface PeriodontalTreatmentRow {
  id: string
  phase: PeriodontalTreatmentPhase
  procedure: string
  plannedDate: string
  status: PeriodontalTreatmentStatus
  notes: string
}

export interface PeriodontalIndicesSummary {
  evaluatedSites: number
  bleedingSites: number
  plaqueSites: number
  bleedingIndexPercent: number
  plaqueIndexPercent: number
  deepPocketSites: number
  deepPocketTeeth: number[]
}

/** Anexo de periodoncia — periodontograma completo (v2) */
export interface PeriodonticsAnnexV2 {
  version: 2
  teeth: PeriodontalToothRecord[]
  selectedTooth: ToothNumber | null
  diagnosis: PeriodontalDiagnosis
  treatmentPlan: PeriodontalTreatmentRow[]
}

/** Formato legado (campos de texto plano) */
export interface PeriodonticsAnnexLegacy {
  probingDepth?: string
  bleedingIndex?: string
  mobility?: string
  plaqueControl?: string
  radiographicFindings?: string
  periodontalDiagnosis?: string
  proposedTherapy?: string
  notes?: string
}

export type PeriodonticsAnnex = PeriodonticsAnnexV2

export const PERIODONTAL_SITE_KEYS: PeriodontalSiteKey[] = [
  'mesiovestibular',
  'vestibular',
  'distovestibular',
  'mesiolingual',
  'lingual',
  'distolingual',
]

export const PERIODONTAL_SITE_LABELS: Record<PeriodontalSiteKey, string> = {
  mesiovestibular: 'Mesiovestibular',
  vestibular: 'Vestibular',
  distovestibular: 'Distovestibular',
  mesiolingual: 'Mesiolingual / Palatino',
  lingual: 'Lingual / Palatino',
  distolingual: 'Distolingual',
}

export const UPPER_FDI_ARCH: ToothNumber[] = [
  18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28,
]

export const LOWER_FDI_ARCH: ToothNumber[] = [
  48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38,
]

export const PERIODONTAL_TREATMENT_PHASE_LABELS: Record<PeriodontalTreatmentPhase, string> = {
  fase_i: 'Fase I — Higiénica',
  fase_ii: 'Fase II — Quirúrgica',
  fase_iii: 'Fase III — Mantenimiento',
}

export const DEFAULT_PHASE_PROCEDURES: Record<PeriodontalTreatmentPhase, string> = {
  fase_i: 'Instrucción de higiene oral, control de placa, RAR',
  fase_ii: 'Cirugía periodontal / regenerativa',
  fase_iii: 'Soporte periodontal (mantenimiento)',
}
