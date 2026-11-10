import type { DiagnosisAnatomicalScope } from '@/types/clinicalRecord'

/** Diagnóstico CIE-10 permitido en la demo (selección única). */
export interface DemoDiagnosis {
  code: string
  description: string
  /** Pieza FDI asociada (permanente o temporal). */
  toothNumber?: number
  /** Alcance anatómico cuando no aplica una sola pieza. */
  anatomicalScope?: DiagnosisAnatomicalScope
}

/** Única fila de plan de tratamiento permitida en la demo. */
export interface DemoTreatmentRow {
  cupsCode: string
  procedureName: string
  quantity: number
  unitCost: number
  /** Diagnóstico CIE-10 importado desde el Paso 4. */
  diagnosisCode?: string
  diagnosisDescription?: string
  /** Pieza o alcance asociado al diagnóstico del Paso 4. */
  diagnosisToothNumber?: number
  diagnosisAnatomicalScope?: DiagnosisAnatomicalScope
}

/** Abono registrado contra el presupuesto del Paso 5. */
export interface DemoPayment {
  amount: number
  method: string
  note: string
}

/** Estado de superficie en el odontograma de la demo (azul / rojo). */
export type DemoFaceState = 'sano' | 'obturado' | 'caries'

export type DemoToothFace = 'vestibular' | 'mesial' | 'oclusal' | 'distal' | 'lingual'

export type DemoToothGlobalState = 'presente' | 'ausente' | 'exodoncia_indicada'

export type DemoOdontogramToolId =
  | 'buen_estado'
  | 'diente_ausente'
  | 'exodoncia_indicada'
  | 'patologia'

export interface DemoToothFaces {
  vestibular: DemoFaceState
  mesial: DemoFaceState
  oclusal: DemoFaceState
  distal: DemoFaceState
  lingual: DemoFaceState
}

/** Hallazgo por pieza FDI en la demo. */
export interface DemoToothMark {
  globalState: DemoToothGlobalState
  faces: DemoToothFaces
}

export type DemoOdontogramMarks = Record<string, DemoToothMark>

export const EMPTY_DEMO_FACES: DemoToothFaces = {
  vestibular: 'sano',
  mesial: 'sano',
  oclusal: 'sano',
  distal: 'sano',
  lingual: 'sano',
}

export function createEmptyDemoToothMark(): DemoToothMark {
  return { globalState: 'presente', faces: { ...EMPTY_DEMO_FACES } }
}

/** Piezas con algún hallazgo (superficie o X). */
export function demoMarkedToothIds(marks: DemoOdontogramMarks): string[] {
  return Object.entries(marks)
    .filter(([, mark]) => {
      if (mark.globalState !== 'presente') return true
      return Object.values(mark.faces).some((face) => face !== 'sano')
    })
    .map(([toothId]) => toothId)
    .sort()
}

/** Estado global de la demo interactiva (cascarón + pasos). */
export interface DemoFormData {
  patientName: string
  chiefComplaint: string
  /** Odontograma de la demo: superficies azul/rojo y X azul/roja. */
  odontogramMarks: DemoOdontogramMarks
  /** Diagnóstico CIE-10 único del catálogo odontológico (null = ninguno). */
  selectedDiagnosis: DemoDiagnosis | null
  /** Máximo una fila de procedimiento en la demo. */
  treatmentRow: DemoTreatmentRow | null
  /** Firma digital guardada (PNG data URL) o null. */
  signatureDataUrl: string | null
  /** Abono al presupuesto (Paso 7). */
  payment: DemoPayment | null
  /** Nota de evolución clínica (Paso 8). */
  evolutionNote: string
  /** Firma exclusiva del odontólogo en la evolución (Res. 1995/1999). */
  evolutionProfessionalName: string
  evolutionRethus: string
  evolutionProfessionalSignature: string | null
  /** Timestamp inmutable al guardar la firma profesional. */
  evolutionSignedAt: string | null
  /** JSON RIPS generado en el Paso 9 (texto pretty-printed). */
  generatedRipsJson: string | null
}

export const EMPTY_DEMO_FORM: DemoFormData = {
  patientName: '',
  chiefComplaint: '',
  odontogramMarks: {},
  selectedDiagnosis: null,
  treatmentRow: null,
  signatureDataUrl: null,
  payment: null,
  evolutionNote: '',
  evolutionProfessionalName: '',
  evolutionRethus: '',
  evolutionProfessionalSignature: null,
  evolutionSignedAt: null,
  generatedRipsJson: null,
}

export function demoTreatmentTotal(row: DemoTreatmentRow): number {
  return Math.max(0, row.quantity) * Math.max(0, row.unitCost)
}

export function demoBudgetBalance(form: DemoFormData): {
  total: number
  paid: number
  remaining: number
} {
  const total = form.treatmentRow ? demoTreatmentTotal(form.treatmentRow) : 0
  const paid = form.payment?.amount ?? 0
  return {
    total,
    paid,
    remaining: Math.max(0, total - paid),
  }
}
