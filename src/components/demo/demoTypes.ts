/** Diagnóstico CIE-10 permitido en la demo (selección única). */
export interface DemoDiagnosis {
  code: string
  description: string
}

/** Única fila de plan de tratamiento permitida en la demo. */
export interface DemoTreatmentRow {
  procedureName: string
  quantity: number
  unitCost: number
}

/** Abono registrado contra el presupuesto del Paso 5. */
export interface DemoPayment {
  amount: number
  method: string
  note: string
}

/** Estado global de la demo interactiva (cascarón + pasos). */
export interface DemoFormData {
  patientName: string
  chiefComplaint: string
  /** Piezas FDI seleccionadas en el odontograma simplificado. */
  selectedTeeth: string[]
  /** Código CIE-10 único seleccionado (null = ninguno). */
  selectedDiagnosisCode: string | null
  /** Máximo una fila de procedimiento en la demo. */
  treatmentRow: DemoTreatmentRow | null
  /** Firma digital guardada (PNG data URL) o null. */
  signatureDataUrl: string | null
  /** Abono al presupuesto (Paso 8). */
  payment: DemoPayment | null
  /** Nota de evolución clínica (Paso 9). */
  evolutionNote: string
  /** JSON RIPS generado en el Paso 10 (texto pretty-printed). */
  generatedRipsJson: string | null
}

export const EMPTY_DEMO_FORM: DemoFormData = {
  patientName: '',
  chiefComplaint: '',
  selectedTeeth: [],
  selectedDiagnosisCode: null,
  treatmentRow: null,
  signatureDataUrl: null,
  payment: null,
  evolutionNote: '',
  generatedRipsJson: null,
}

/** Lista quemada de diagnósticos dentales comunes para el Paso 4. */
export const DEMO_CIE10_DIAGNOSES: DemoDiagnosis[] = [
  { code: 'K02.1', description: 'Caries de la dentina' },
  { code: 'K04.0', description: 'Pulpitis' },
  { code: 'K05.1', description: 'Gingivitis crónica' },
]

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
