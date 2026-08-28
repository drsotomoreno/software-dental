import type { RehabQuadrantId, RehabTreatmentOption, RehabTreatmentType } from './types'

/** 32 piezas permanentes — 8 dientes por cuadrante (incluye terceros molares) */
export const REHAB_ODONTOGRAM_TEETH: Record<RehabQuadrantId, number[]> = {
  upperRight: [18, 17, 16, 15, 14, 13, 12, 11],
  upperLeft: [21, 22, 23, 24, 25, 26, 27, 28],
  lowerLeft: [38, 37, 36, 35, 34, 33, 32, 31],
  lowerRight: [41, 42, 43, 44, 45, 46, 47, 48],
}

export const REHAB_QUADRANT_LABELS: Record<RehabQuadrantId, string> = {
  upperRight: 'Superior derecho (cuadrante 1)',
  upperLeft: 'Superior izquierdo (cuadrante 2)',
  lowerLeft: 'Inferior izquierdo (cuadrante 3)',
  lowerRight: 'Inferior derecho (cuadrante 4)',
}

export const REHAB_TREATMENT_OPTIONS: RehabTreatmentOption[] = [
  { id: 'corona_individual', label: 'Corona Individual', color: '#3B82F6' },
  { id: 'carilla', label: 'Carilla Dental', color: '#EC4899' },
  { id: 'implante', label: 'Implante Dental', color: '#6B7280' },
  { id: 'pilar_ppf', label: 'Pilar de PPF', color: '#8B5CF6' },
  { id: 'pontico_ppf', label: 'Póntico de PPF', color: '#F97316' },
  { id: 'incrustacion', label: 'Incrustación', color: '#94A3B8' },
]

export const REHAB_PROTESIS_TOTAL_COLOR = '#0D9488'
export const REHAB_PROTESIS_TOTAL_LABEL = 'Prótesis Total'

export const REHAB_PROTESIS_PARCIAL_REMOVIBLE_COLOR = '#CA8A04'
export const REHAB_PROTESIS_PARCIAL_REMOVIBLE_LABEL = 'Prótesis Parcial Removible'

export const REHAB_PROTESIS_TOTAL_OPTION = {
  id: 'protesis_total' as const,
  label: REHAB_PROTESIS_TOTAL_LABEL,
  color: REHAB_PROTESIS_TOTAL_COLOR,
}

export const REHAB_PROTESIS_PARCIAL_REMOVIBLE_OPTION = {
  id: 'protesis_parcial_removible' as const,
  label: REHAB_PROTESIS_PARCIAL_REMOVIBLE_LABEL,
  color: REHAB_PROTESIS_PARCIAL_REMOVIBLE_COLOR,
}

export const REHAB_ARCH_PROSTHESIS_SCOPE_OPTIONS = [
  { id: 'superior_inferior' as const, label: 'Superior e inferior' },
  { id: 'superior' as const, label: 'Solo superior' },
  { id: 'inferior' as const, label: 'Solo inferior' },
]

/** Opciones del esquema de planificación (por pieza + prótesis por arcada) */
export const REHAB_PLANNING_OPTIONS = [
  ...REHAB_TREATMENT_OPTIONS,
  REHAB_PROTESIS_TOTAL_OPTION,
  REHAB_PROTESIS_PARCIAL_REMOVIBLE_OPTION,
]

/** Esquema de implantes en arcos dentados — solo implante y póntico */
export const IMPLANT_ODONTOGRAM_TREATMENT_OPTIONS: RehabTreatmentOption[] = [
  { id: 'implante', label: 'Implante Dental', color: '#6B7280' },
  {
    id: 'pontico_ppf',
    label: 'Póntico de Prótesis Fija Sobre Implantes',
    color: '#F97316',
  },
]

export const IMPLANT_ODONTOGRAM_PLANNING_OPTIONS = [...IMPLANT_ODONTOGRAM_TREATMENT_OPTIONS]

export const REHAB_SELECTION_COLOR = '#2563EB'

/** Tratamientos permitidos sobre piezas marcadas como eliminadas */
export const REHAB_ELIMINATED_TOOTH_TREATMENTS: RehabTreatmentType[] = ['implante', 'pontico_ppf']

// Compatibilidad con imports previos
export const REHAB_PROTESIS_TOTAL_SCOPE_OPTIONS = REHAB_ARCH_PROSTHESIS_SCOPE_OPTIONS
