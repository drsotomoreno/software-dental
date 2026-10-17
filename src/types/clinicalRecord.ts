import type { Anamnesis } from './anamnesis'
import type { StomatologicalExam } from './stomatologicalExam'
import type { SpecializedAnnexes } from './specializedAnnexes'
import type { EvolutionNote } from './evolutionNote'
import type { InformedConsent } from './consent'
import type { SectionBiometricSignature } from './sectionSignature'
import type { ValuationConsentMetadata } from './valuationConsent'
import type { OdontogramData } from './odontogram'
import type { ClinicalDiagnosticChart } from './clinicalDiagnosticChart'
import type { ImplantFdiQuadrant } from '@/constants/implantPlanning'

/** Tipo de certeza diagnóstica CIE-10 */
export type DiagnosisCertainty = 'impresion' | 'confirmado' | 'repetido'

/** Diagnóstico CIE-10 — codificación obligatoria RIPS */
export interface Cie10Diagnosis {
  code: string
  description: string
  type: 'principal' | 'relacionado'
  certainty: DiagnosisCertainty
  /** Origen del diagnóstico */
  source?: 'odontograma' | 'manual' | 'odontograma_suplementario'
  /** Piezas dentales FDI asociadas (si proviene del odontograma) */
  affectedTeeth?: number[]
}

/** Fases del plan de tratamiento odontológico */
export type TreatmentPhase = 'fase_i' | 'fase_ii' | 'fase_iii' | 'fase_iv'

export type TreatmentApprovalStatus = 'pendiente' | 'aprobado' | 'rechazado'
export type TreatmentExecutionStatus = 'pendiente' | 'en_progreso' | 'completado' | 'cancelado'

export interface TreatmentPlanItem {
  id: string
  phase: TreatmentPhase
  procedure: string
  /** CUPS — Codificación Única de Procedimientos en Salud */
  cupsCode?: string
  toothNumber?: number
  /** Cuadrante FDI (Q1–Q4) para procedimientos periodontal / por sector */
  fdiQuadrant?: ImplantFdiQuadrant
  /** Arcada para procedimientos mucosoportados o de arcada completa */
  arch?: 'superior' | 'inferior'
  /**
   * Texto de la columna Diente / Zona.
   * Pieza (16), rango (14-18), cuadrante (Q1) o alcance (General, Arcada Superior, Arcada Inferior).
   */
  anatomicalZone?: string
  quantity: number
  unitPrice: number
  notes?: string
  patientApproved: TreatmentApprovalStatus
  executionStatus: TreatmentExecutionStatus
  sessionDate?: string
  /** Origen del ítem — las sugerencias del odontograma son editables por el odontólogo */
  source?:
    | 'manual'
    | 'sugerencia'
    | 'orthodontics_annex'
    | 'endodontics_annex'
    | 'oral_surgery_annex'
    | 'periodontics_annex'
    | 'diagnostico'
  /** Diagnóstico CIE-10 vinculado al importar desde la sección 4 */
  diagnosisCode?: string
  diagnosisDescription?: string
}

export interface BudgetSummary {
  subtotal: number
  discount: number
  total: number
  currency: 'COP'
}

/** Línea del presupuesto de ortodoncia (cantidad × valor unitario) */
export interface OrthodonticsBudgetLine {
  quantity: number
  unitPrice: number
}

/** Subdivisión de presupuesto para tratamiento de ortodoncia */
export interface OrthodonticsBudget {
  active: boolean
  initialInstallment: OrthodonticsBudgetLine
  controls: OrthodonticsBudgetLine
  retainers: OrthodonticsBudgetLine
}

/** Línea del presupuesto de implantes (cantidad × valor unitario) */
export interface DentalImplantsBudgetLine {
  quantity: number
  unitPrice: number
}

/** Subdivisión de presupuesto para tratamiento con implantes dentales */
export interface DentalImplantsBudget {
  active: boolean
  implantPlacement: DentalImplantsBudgetLine
  prosthetics: DentalImplantsBudgetLine
}

/** Ítem del presupuesto — procedimiento con precio */
export interface BudgetLineItem {
  id: string
  /** Vínculo opcional con el plan de tratamiento clínico */
  treatmentPlanItemId?: string
  procedure: string
  cupsCode?: string
  toothNumber?: number
  /** Cuadrante FDI (Q1–Q4) para procedimientos periodontal / por sector */
  fdiQuadrant?: ImplantFdiQuadrant
  /** Arcada para procedimientos mucosoportados o de arcada completa */
  arch?: 'superior' | 'inferior'
  /**
   * Texto de Diente / Zona copiado del plan.
   * Conserva rangos y combinaciones (16, 14-18, Q1) que no caben en una sola pieza.
   */
  anatomicalZone?: string
  diagnosisCode?: string
  diagnosisDescription?: string
  quantity: number
  unitPrice: number
  source?: 'manual' | 'treatment_plan' | 'endodontics_annex'
}

export type PaymentMethod =
  | 'contado'
  | 'cuotas'
  | 'abono_inicial'
  | 'eps'
  | 'transferencia'
  | 'tarjeta'
  | 'mixto'
  | 'otro'

/**
 * Fila de Control de Pagos.
 * Vive dentro del registro clínico (Dexie) y alimenta el JSON RIPS
 * cuando el procedimiento no está ya cubierto por presupuesto o plan.
 */
export interface PaymentControlLine {
  id: string
  procedure: string
  /** CUPS — Codificación Única de Procedimientos en Salud */
  cupsCode?: string
  toothNumber?: number
  /** Cuadrante FDI (Q1–Q4) */
  fdiQuadrant?: ImplantFdiQuadrant
  /** Arcada para procedimientos de arcada completa */
  arch?: 'superior' | 'inferior'
  /**
   * Texto de la columna Diente / Zona.
   * Pieza (16), rango (14-18), cuadrante (Q1) o alcance (General, Arcada Superior, Arcada Inferior).
   */
  anatomicalZone?: string
  quantity: number
  unitPrice: number
  diagnosisCode?: string
  diagnosisDescription?: string
  /** Ítem de presupuesto del que se importó la fila */
  budgetItemId?: string
  source?: 'manual' | 'budget'
}

/** Forma de pago acordada por procedimiento */
export interface PaymentPlanItem {
  id: string
  /** Vínculo con ítem del presupuesto */
  budgetItemId?: string
  /** Fila de la tabla clínica (zona, CIE, CUPS) a la que pertenece este acuerdo */
  paymentControlLineId?: string
  /** Fila creada manualmente en el plan de pagos */
  source?: 'custom' | 'budget'
  procedure: string
  cupsCode?: string
  totalAmount: number
  paymentMethod: PaymentMethod
  /** Número de cuotas (si aplica) */
  installments?: number
  /** Abono o cuota inicial */
  initialPayment?: number
  /** Valor de cada cuota */
  installmentAmount?: number
  /** Fecha de pago o primera cuota */
  dueDate?: string
  /** Descripción libre: calendario, condiciones, observaciones */
  scheduleNotes?: string
}

/** Factura asociada a un pago recibido */
export type PaymentInvoiceStatus = 'active' | 'voided_by_credit_note'

export interface PaymentInvoice {
  id: string
  invoiceNumber: string
  invoiceDate: string
  amount: number
  notes?: string
  /** Generada automáticamente al registrar el pago en Control de Pagos */
  autoGenerated?: boolean
  status?: PaymentInvoiceStatus
  creditNoteId?: string
  creditNoteNumber?: string
  voidReason?: string
  /** Factura automática con proveedor vs recibo interno */
  emissionMode?: 'provider' | 'manual'
  cufe?: string | null
  cuv?: string | null
  dianQrUrl?: string | null
  /** RIPS JSON de salud asociado al cobro (stringificado) */
  ripsJsonSnapshot?: string | null
}

/** Registro de pago efectuado — control de caja */
export interface PaymentRecord {
  id: string
  /** Vínculo opcional con fila del plan de pagos */
  paymentPlanItemId?: string
  /** Vínculo con la fila de Control de Pagos que originó el abono */
  paymentControlLineId?: string
  paymentDate: string
  amount: number
  paymentMethod: PaymentMethod
  /** Motivo del pago */
  paymentReason: string
  /** Código CUPS vinculado (opcional) */
  cupsCode?: string
  /** Usuario odontólogo tratante responsable del pago */
  treatingDentistUserId?: string
  /** Nombre del odontólogo al momento del registro (para factura e historial) */
  treatingDentistName?: string
  invoices: PaymentInvoice[]
  notes?: string
}

export type OrthodonticsPaymentType = 'cuota_inicial' | 'control' | 'retenedores' | 'adicional'

/** Pago registrado en control de ortodoncia */
export interface OrthodonticsPaymentRecord {
  id: string
  paymentDate: string
  amount: number
  paymentMethod: PaymentMethod
  paymentType: OrthodonticsPaymentType
  /** Nº de control pagado (1…N según presupuesto) */
  controlNumber?: number
  /** Especificación del pago adicional */
  additionalPaymentDescription?: string
  paymentReason: string
  invoices: PaymentInvoice[]
  notes?: string
}

/** Registro clínico inmutable tras firma (Ley 527 / Res. 1995 de 1999) */
export interface ClinicalRecord {
  id?: number | string
  patientId: string
  professionalId: string
  /** Sección 1: Anamnesis */
  anamnesis: Anamnesis
  /** Sección 2: Examen estomatológico */
  stomatologicalExam: StomatologicalExam
  /** Sección 3: Anexos especializados (periodoncia, ortodoncia, implantes) */
  specializedAnnexes: SpecializedAnnexes
  /** Snapshot del odontograma al momento de firma */
  odontogramSnapshot?: OdontogramData
  /** Esquema gráfico de diagnósticos por pieza FDI */
  diagnosticChart?: ClinicalDiagnosticChart
  /** Sección 4: Diagnósticos CIE-10 */
  diagnoses: Cie10Diagnosis[]
  /** Criterio clínico y observaciones del diagnóstico */
  diagnosisNotes?: string
  /** Hallazgos adicionales (texto libre complementario) */
  findings: string
  /** Sección 5: Plan de tratamiento por fases */
  treatmentPlan: TreatmentPlanItem[]
  /** Objetivos, alternativas y criterio clínico del odontólogo */
  treatmentPlanNotes?: string
  /**
   * Sello del plan de tratamiento, odontograma y presupuesto.
   * Solo se escribe cuando el paciente acepta esa sección en MasterSignatureModal.
   */
  treatmentPlanLegal?: SectionBiometricSignature
  /** Sección 6: Presupuesto — tratamientos con precio */
  budgetItems: BudgetLineItem[]
  orthodonticsBudget?: OrthodonticsBudget
  dentalImplantsBudget?: DentalImplantsBudget
  budget: BudgetSummary
  /** Sección 9: acuerdo de pago por procedimiento */
  paymentPlan: PaymentPlanItem[]
  /** Sección 9: abonos, facturas y saldo */
  paymentControl: PaymentRecord[]
  /** Filas clínicas de la sección 9 (zona, CIE, CUPS y precio) */
  paymentControlLines?: PaymentControlLine[]
  orthodonticsPaymentControl: OrthodonticsPaymentRecord[]
  /** Sección 9: Notas de evolución */
  evolutionNotes: EvolutionNote[]
  /** Sección 10: Consentimiento informado */
  informedConsent: InformedConsent
  /** Consentimiento de valoración rápida */
  valuationConsent?: ValuationConsentMetadata | null
  odontogramSnapshotId?: string
  signatureId?: string
  patientSignatureId?: string
  contentHash?: string
  signedAt?: string
  /**
   * Snapshot de atención cerrado para facturación / RIPS / integridad del paquete.
   * No bloquea la HCE viva: odontograma, demografía, plan futuro ni nuevos folios.
   * El bloqueo legal (Res. 1995/1999) de una sección la escribe MasterSignatureModal
   * en el objeto correspondiente (anamnesis, plan de tratamiento o consentimiento).
   * Cada `EvolutionNote` firmada sigue siendo un folio inmutable.
   */
  isLocked: boolean
  /** CUV entregado por el MUV al cerrar la atención sin factura. */
  cuv?: string | null
  /** PENDIENTE, APROBADO o RECHAZADO. */
  estadoMuv?: 'PENDIENTE' | 'APROBADO' | 'RECHAZADO' | null
  /** Notificaciones o errores de ResultadosValidacion. */
  resultadoValidacion?: unknown
  createdAt: string
  updatedAt: string
  syncId?: string
  clinicId?: string
  patientSyncId?: string
  pendingSync?: boolean
  lastSyncedAt?: string
}

export interface ClinicalRecordFormData {
  anamnesis: Anamnesis
  stomatologicalExam: StomatologicalExam
  specializedAnnexes: SpecializedAnnexes
  diagnosticChart: ClinicalDiagnosticChart
  diagnoses: Cie10Diagnosis[]
  diagnosisNotes?: string
  findings: string
  treatmentPlan: TreatmentPlanItem[]
  treatmentPlanNotes?: string
  /** Sello legal del plan, odontograma y presupuesto. Ausente si esa sección sigue abierta. */
  treatmentPlanLegal?: SectionBiometricSignature
  budgetItems: BudgetLineItem[]
  orthodonticsBudget?: OrthodonticsBudget
  dentalImplantsBudget?: DentalImplantsBudget
  budget: BudgetSummary
  paymentPlan: PaymentPlanItem[]
  paymentControl: PaymentRecord[]
  paymentControlLines: PaymentControlLine[]
  orthodonticsPaymentControl: OrthodonticsPaymentRecord[]
  evolutionNotes: EvolutionNote[]
  informedConsent: InformedConsent
  /** Consentimiento de valoración rápida (sesión inicial) */
  valuationConsent?: ValuationConsentMetadata | null
}
