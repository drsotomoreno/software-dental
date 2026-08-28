export type ImplantPeriodontitisHistoryStatus = 'healthy' | 'treated_stabilized' | 'active'

export type ImplantGingivalBiotype = 'thin' | 'thick'

export type ImplantKeratinizedMucosaWidth = 'adequate' | 'insufficient'

export type ImplantBleedingOnProbing = 'positive' | 'negative'

export type ImplantAdjacentToothMobility = '0' | 'I' | 'II' | 'III'

export type ImplantGingivalInflammationStatus =
  | 'none'
  | 'localized_chronic_gingivitis'
  | 'gingival_hyperplasia'

export const IMPLANT_PERIODONTITIS_HISTORY_OPTIONS: {
  id: ImplantPeriodontitisHistoryStatus
  label: string
  alert?: string
}[] = [
  { id: 'healthy', label: 'Sin antecedentes / Periodonto sano' },
  { id: 'treated_stabilized', label: 'Periodontitis tratada y estabilizada' },
  {
    id: 'active',
    label: 'Periodontitis activa (requiere tratamiento previo obligatorio)',
    alert: 'Requiere tratamiento periodontal previo antes de la cirugía de implantes.',
  },
]

export const IMPLANT_GINGIVAL_BIOTYPE_OPTIONS: { id: ImplantGingivalBiotype; label: string }[] = [
  { id: 'thin', label: 'Fino' },
  { id: 'thick', label: 'Grueso' },
]

export const IMPLANT_KERATINIZED_MUCOSA_OPTIONS: {
  id: ImplantKeratinizedMucosaWidth
  label: string
  alert?: string
}[] = [
  { id: 'adequate', label: 'Adecuado (≥ 2 mm)' },
  {
    id: 'insufficient',
    label: 'Insuficiente (< 2 mm / requiere aumento mucogingival)',
    alert: 'Ancho de mucosa queratinizada insuficiente; valorar aumento mucogingival previo.',
  },
]

export const IMPLANT_BOP_OPTIONS: { id: ImplantBleedingOnProbing; label: string }[] = [
  { id: 'negative', label: 'BOP negativo' },
  { id: 'positive', label: 'BOP positivo' },
]

export const IMPLANT_MOBILITY_OPTIONS: { id: ImplantAdjacentToothMobility; label: string }[] = [
  { id: '0', label: 'Grado 0' },
  { id: 'I', label: 'Grado I' },
  { id: 'II', label: 'Grado II' },
  { id: 'III', label: 'Grado III' },
]

export const IMPLANT_GINGIVAL_INFLAMMATION_OPTIONS: {
  id: ImplantGingivalInflammationStatus
  label: string
}[] = [
  { id: 'none', label: 'Ausencia de inflamación' },
  { id: 'localized_chronic_gingivitis', label: 'Gingivitis localizada / crónica' },
  { id: 'gingival_hyperplasia', label: 'Hiperplasia gingival presente' },
]

export interface ImplantMucogingivalDefects {
  gingivalRecessions: boolean
  papillaLossAlveolarDefects: boolean
  notes: string
}

export interface ImplantAdjacentTeethHealth {
  deepPockets: boolean
  bleedingOnProbing: ImplantBleedingOnProbing | ''
  mobilityGrade: ImplantAdjacentToothMobility | ''
}

export interface ImplantPeriodontalAssessment {
  periodontitisHistory: ImplantPeriodontitisHistoryStatus | ''
  gingivalBiotype: ImplantGingivalBiotype | ''
  keratinizedMucosaWidth: ImplantKeratinizedMucosaWidth | ''
  mucogingivalDefects: ImplantMucogingivalDefects
  adjacentTeethHealth: ImplantAdjacentTeethHealth
  gingivalInflammation: ImplantGingivalInflammationStatus | ''
}

export function createEmptyImplantPeriodontalAssessment(): ImplantPeriodontalAssessment {
  return {
    periodontitisHistory: '',
    gingivalBiotype: '',
    keratinizedMucosaWidth: '',
    mucogingivalDefects: {
      gingivalRecessions: false,
      papillaLossAlveolarDefects: false,
      notes: '',
    },
    adjacentTeethHealth: {
      deepPockets: false,
      bleedingOnProbing: '',
      mobilityGrade: '',
    },
    gingivalInflammation: '',
  }
}

function isValidOption<T extends string>(value: unknown, options: { id: T }[]): value is T {
  return options.some((item) => item.id === value)
}

export function normalizeImplantPeriodontalAssessment(
  data?: Partial<ImplantPeriodontalAssessment>,
): ImplantPeriodontalAssessment {
  const empty = createEmptyImplantPeriodontalAssessment()

  return {
    periodontitisHistory: isValidOption(data?.periodontitisHistory, IMPLANT_PERIODONTITIS_HISTORY_OPTIONS)
      ? data.periodontitisHistory
      : '',
    gingivalBiotype: isValidOption(data?.gingivalBiotype, IMPLANT_GINGIVAL_BIOTYPE_OPTIONS)
      ? data.gingivalBiotype
      : '',
    keratinizedMucosaWidth: isValidOption(
      data?.keratinizedMucosaWidth,
      IMPLANT_KERATINIZED_MUCOSA_OPTIONS,
    )
      ? data.keratinizedMucosaWidth
      : '',
    mucogingivalDefects: {
      gingivalRecessions: Boolean(data?.mucogingivalDefects?.gingivalRecessions),
      papillaLossAlveolarDefects: Boolean(data?.mucogingivalDefects?.papillaLossAlveolarDefects),
      notes:
        typeof data?.mucogingivalDefects?.notes === 'string'
          ? data.mucogingivalDefects.notes
          : empty.mucogingivalDefects.notes,
    },
    adjacentTeethHealth: {
      deepPockets: Boolean(data?.adjacentTeethHealth?.deepPockets),
      bleedingOnProbing: isValidOption(
        data?.adjacentTeethHealth?.bleedingOnProbing,
        IMPLANT_BOP_OPTIONS,
      )
        ? data.adjacentTeethHealth.bleedingOnProbing
        : '',
      mobilityGrade: isValidOption(data?.adjacentTeethHealth?.mobilityGrade, IMPLANT_MOBILITY_OPTIONS)
        ? data.adjacentTeethHealth.mobilityGrade
        : '',
    },
    gingivalInflammation: isValidOption(
      data?.gingivalInflammation,
      IMPLANT_GINGIVAL_INFLAMMATION_OPTIONS,
    )
      ? data.gingivalInflammation
      : '',
  }
}

export function hasPeriodontalPlanningAlerts(assessment: ImplantPeriodontalAssessment): boolean {
  return getPeriodontalPlanningAlerts(assessment).length > 0
}

export function getPeriodontalPlanningAlerts(assessment: ImplantPeriodontalAssessment): string[] {
  const alerts: string[] = []

  if (assessment.periodontitisHistory === 'active') {
    const option = IMPLANT_PERIODONTITIS_HISTORY_OPTIONS.find((item) => item.id === 'active')
    alerts.push(
      option?.alert ??
        'Periodontitis activa: requiere tratamiento periodontal previo antes de la cirugía de implantes.',
    )
  }

  if (assessment.keratinizedMucosaWidth === 'insufficient') {
    const option = IMPLANT_KERATINIZED_MUCOSA_OPTIONS.find((item) => item.id === 'insufficient')
    alerts.push(
      option?.alert ??
        'Mucosa queratinizada insuficiente: valorar tratamiento mucogingival previo.',
    )
  }

  if (assessment.adjacentTeethHealth.deepPockets) {
    alerts.push(
      'Bolsas periodontales profundas en dientes adyacentes (> 4 mm): requiere tratamiento periodontal previo.',
    )
  }

  return alerts
}

export function formatImplantPeriodontalAssessmentSummary(
  assessment: ImplantPeriodontalAssessment,
): string {
  const parts: string[] = []

  const history = IMPLANT_PERIODONTITIS_HISTORY_OPTIONS.find(
    (item) => item.id === assessment.periodontitisHistory,
  )?.label
  if (history) parts.push(`Periodontitis: ${history}`)

  const biotype = IMPLANT_GINGIVAL_BIOTYPE_OPTIONS.find(
    (item) => item.id === assessment.gingivalBiotype,
  )?.label
  const mucosa = IMPLANT_KERATINIZED_MUCOSA_OPTIONS.find(
    (item) => item.id === assessment.keratinizedMucosaWidth,
  )?.label
  if (biotype || mucosa) {
    parts.push(
      [`Biotipo ${biotype ?? '—'}`, mucosa ? `Mucosa ${mucosa}` : ''].filter(Boolean).join(' · '),
    )
  }

  const defects: string[] = []
  if (assessment.mucogingivalDefects.gingivalRecessions) defects.push('recesiones gingivales')
  if (assessment.mucogingivalDefects.papillaLossAlveolarDefects) {
    defects.push('pérdida de papilas / defectos de reborde')
  }
  if (defects.length > 0) parts.push(`Defectos mucogingivales: ${defects.join(', ')}`)
  if (assessment.mucogingivalDefects.notes.trim()) {
    parts.push(`Notas mucogingivales: ${assessment.mucogingivalDefects.notes.trim()}`)
  }

  const adjacent: string[] = []
  if (assessment.adjacentTeethHealth.deepPockets) adjacent.push('bolsas > 4 mm')
  if (assessment.adjacentTeethHealth.bleedingOnProbing) {
    const bop = IMPLANT_BOP_OPTIONS.find(
      (item) => item.id === assessment.adjacentTeethHealth.bleedingOnProbing,
    )?.label
    if (bop) adjacent.push(bop)
  }
  if (assessment.adjacentTeethHealth.mobilityGrade) {
    const mobility = IMPLANT_MOBILITY_OPTIONS.find(
      (item) => item.id === assessment.adjacentTeethHealth.mobilityGrade,
    )?.label
    if (mobility) adjacent.push(`movilidad ${mobility}`)
  }
  if (adjacent.length > 0) parts.push(`Dientes adyacentes: ${adjacent.join(', ')}`)

  const inflammation = IMPLANT_GINGIVAL_INFLAMMATION_OPTIONS.find(
    (item) => item.id === assessment.gingivalInflammation,
  )?.label
  if (inflammation) parts.push(`Inflamación gingival: ${inflammation}`)

  return parts.length > 0 ? `Evaluación periodontal pre-implante: ${parts.join(' · ')}` : ''
}
