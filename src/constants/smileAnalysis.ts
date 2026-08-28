export type SmileAnalysisCategory =
  | 'exposicion_reposo'
  | 'exposicion_sonrisa'
  | 'linea_sonrisa'
  | 'curva_sonrisa'

export interface SmileAnalysisOption {
  id: SmileAnalysisCategory
  label: string
}

export const SMILE_ANALYSIS_OPTIONS: SmileAnalysisOption[] = [
  { id: 'exposicion_reposo', label: 'Exposición Dental en Reposo' },
  { id: 'exposicion_sonrisa', label: 'Exposición Dental al Sonreír' },
  { id: 'linea_sonrisa', label: 'Línea de Sonrisa al Sonreír' },
  { id: 'curva_sonrisa', label: 'Curva De Sonrisa' },
]

export interface RehabSmileAnalysis {
  exposicion_reposo: boolean
  exposicion_sonrisa: boolean
  linea_sonrisa: boolean
  curva_sonrisa: boolean
  exposicionReposoNotas: string
  exposicionSonrisaNotas: string
  lineaSonrisaNotas: string
  curvaSonrisaNotas: string
}

const NOTES_FIELD_BY_CATEGORY: Record<SmileAnalysisCategory, keyof RehabSmileAnalysis> = {
  exposicion_reposo: 'exposicionReposoNotas',
  exposicion_sonrisa: 'exposicionSonrisaNotas',
  linea_sonrisa: 'lineaSonrisaNotas',
  curva_sonrisa: 'curvaSonrisaNotas',
}

export function smileAnalysisNotesField(category: SmileAnalysisCategory): keyof RehabSmileAnalysis {
  return NOTES_FIELD_BY_CATEGORY[category]
}

export function createEmptySmileAnalysis(): RehabSmileAnalysis {
  return {
    exposicion_reposo: false,
    exposicion_sonrisa: false,
    linea_sonrisa: false,
    curva_sonrisa: false,
    exposicionReposoNotas: '',
    exposicionSonrisaNotas: '',
    lineaSonrisaNotas: '',
    curvaSonrisaNotas: '',
  }
}

export function normalizeSmileAnalysis(data?: Partial<RehabSmileAnalysis>): RehabSmileAnalysis {
  const empty = createEmptySmileAnalysis()
  if (!data) return empty

  return {
    exposicion_reposo: Boolean(data.exposicion_reposo),
    exposicion_sonrisa: Boolean(data.exposicion_sonrisa),
    linea_sonrisa: Boolean(data.linea_sonrisa),
    curva_sonrisa: Boolean(data.curva_sonrisa),
    exposicionReposoNotas: data.exposicionReposoNotas ?? '',
    exposicionSonrisaNotas: data.exposicionSonrisaNotas ?? '',
    lineaSonrisaNotas: data.lineaSonrisaNotas ?? '',
    curvaSonrisaNotas: data.curvaSonrisaNotas ?? '',
  }
}

export function hasSmileAnalysisSelection(value: RehabSmileAnalysis): boolean {
  return SMILE_ANALYSIS_OPTIONS.some((option) => value[option.id])
}

export function formatSmileAnalysis(value: RehabSmileAnalysis): string {
  const parts: string[] = []

  for (const option of SMILE_ANALYSIS_OPTIONS) {
    if (!value[option.id]) continue
    const notes = value[smileAnalysisNotesField(option.id)]
    parts.push(notes ? `${option.label}: ${notes}` : option.label)
  }

  return parts.join(' · ')
}
