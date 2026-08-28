export const CLINICAL_HISTORY_SECTION_NUMBERS = {
  anamnesis: 1,
  examen: 2,
  odontograma: 3,
  diagnosticos: 4,
  examenesComplementarios: 5,
  anexos: 6,
  tratamiento: 7,
  presupuesto: 8,
  planPagos: 9,
  consentimiento: 10,
  evolucion: 11,
  controlPagos: 12,
  exportacionHistoria: 13,
} as const

export type ClinicalHistoryPrintSectionId =
  | 'identificacion'
  | 'anamnesis'
  | 'examen'
  | 'odontograma'
  | 'diagnosticos'
  | 'anexos'
  | 'tratamiento'
  | 'presupuesto'
  | 'planPagos'
  | 'controlPagos'
  | 'evolucion'
  | 'consentimiento'
  | 'examenesComplementarios'
  | 'exportacionHistoria'

export interface ClinicalHistoryPrintSection {
  id: ClinicalHistoryPrintSectionId
  label: string
  number?: number
}

export const CLINICAL_HISTORY_PRINT_SECTIONS: ClinicalHistoryPrintSection[] = [
  { id: 'identificacion', label: 'Datos de Identificación del Paciente' },
  {
    id: 'anamnesis',
    label: 'Datos Generales y Anamnesis',
    number: CLINICAL_HISTORY_SECTION_NUMBERS.anamnesis,
  },
  {
    id: 'examen',
    label: 'Examen Estomatológico / Examen Físico',
    number: CLINICAL_HISTORY_SECTION_NUMBERS.examen,
  },
  {
    id: 'odontograma',
    label: 'Odontograma (Sistema FDI / ISO 3950)',
    number: CLINICAL_HISTORY_SECTION_NUMBERS.odontograma,
  },
  {
    id: 'diagnosticos',
    label: 'Diagnósticos',
    number: CLINICAL_HISTORY_SECTION_NUMBERS.diagnosticos,
  },
  {
    id: 'examenesComplementarios',
    label: 'Exámenes Complementarios y Escaneos',
    number: CLINICAL_HISTORY_SECTION_NUMBERS.examenesComplementarios,
  },
  {
    id: 'anexos',
    label: 'Anexos Especializados',
    number: CLINICAL_HISTORY_SECTION_NUMBERS.anexos,
  },
  {
    id: 'tratamiento',
    label: 'Plan de Tratamiento',
    number: CLINICAL_HISTORY_SECTION_NUMBERS.tratamiento,
  },
  {
    id: 'presupuesto',
    label: 'Presupuesto',
    number: CLINICAL_HISTORY_SECTION_NUMBERS.presupuesto,
  },
  {
    id: 'planPagos',
    label: 'Plan de Pagos',
    number: CLINICAL_HISTORY_SECTION_NUMBERS.planPagos,
  },
  {
    id: 'consentimiento',
    label: 'Consentimiento Informado y Firmas',
    number: CLINICAL_HISTORY_SECTION_NUMBERS.consentimiento,
  },
  {
    id: 'evolucion',
    label: 'Evolución Clínica (Notas de Evolución)',
    number: CLINICAL_HISTORY_SECTION_NUMBERS.evolucion,
  },
  {
    id: 'controlPagos',
    label: 'Control de Pagos',
    number: CLINICAL_HISTORY_SECTION_NUMBERS.controlPagos,
  },
  {
    id: 'exportacionHistoria',
    label: 'Exportación de Historia Clínica',
    number: CLINICAL_HISTORY_SECTION_NUMBERS.exportacionHistoria,
  },
]

export const CLINICAL_SECTION_TITLE_CLASS = 'text-base font-bold text-dental-700'

export const CLINICAL_HISTORY_PAGE_TITLE_CLASS = 'text-2xl font-bold text-dental-700'

export function clinicalSectionTitle(number: number, title: string): string {
  return `${number}. ${title}`
}

export function clinicalPrintSectionLabel(section: ClinicalHistoryPrintSection): string {
  return section.number ? clinicalSectionTitle(section.number, section.label) : section.label
}
