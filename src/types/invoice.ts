import type { RipsTransaction } from './rips'

/** Estado del ciclo de vida de la factura electrónica */
export type InvoiceStatus =
  | 'draft'
  | 'validated'
  | 'submitted'
  | 'cuv_approved'
  | 'dian_sent'
  | 'accepted'
  | 'rejected'
  | 'cancelled'
  | 'voided_by_credit_note'

/** Modalidad de pago sector salud (RIPS / FEV-Salud) */
export type HealthPaymentModality = '01' | '02' | '03' | '04'

/** Cobertura o plan de beneficios */
export type HealthCoveragePlan =
  | '01' // Plan de beneficios en salud
  | '02' // Presupuesto máximo
  | '03' // Prima
  | '04' // Cobertura Póliza SOAT
  | '05' // Cobertura ARL
  | '09' // Otra

/** Campos sectoriales obligatorios MinSalud / DIAN FEV-Salud */
export interface HealthSectorInvoiceFields {
  /** Código REPS del prestador (12 dígitos) */
  codPrestadorReps: string
  /** Modalidad de contratación / pago */
  modalidadPago: HealthPaymentModality
  /** Cobertura o plan de beneficios */
  coberturaPlanBeneficios: HealthCoveragePlan
  /** Tipo de usuario (afiliación) — tabla RIPS */
  tipoUsuario: string
  /** Número de autorización EPS (si aplica) */
  numAutorizacion?: string | null
  /** Concepto de recaudo (copago, cuota moderadora, etc.) */
  conceptoRecaudo?: string
  /** Valor copago / cuota moderadora total */
  valorPagoModerador?: number
  /** Nº FEV del pago moderador (si aplica) */
  numFEVPagoModerador?: string | null
}

/** Línea de detalle de factura electrónica */
export interface InvoiceItem {
  id: string
  lineNumber: number
  description: string
  /** Código CUPS — obligatorio para ítems RIPS */
  cupsCode?: string | null
  /** Diagnóstico CIE-10 asociado */
  cie10Code?: string | null
  cie10Description?: string | null
  cie10Type?: 'principal' | 'relacionado'
  quantity: number
  unitPrice: number
  discountAmount: number
  /** Copago o cuota moderadora aplicado a la línea */
  copayAmount?: number
  totalAmount: number
  /**
   * Procedimiento personalizado/interno o bien no asistencial.
   * Si true → factura DIAN sí, RIPS/MUV no.
   */
  isCustomProcedure?: boolean
  /** false = atención clínica sin cobro (RIPS con vrServicio 0 si aplica) */
  isBillable?: boolean
  /** Fecha de atención del servicio (ISO) */
  attentionDate?: string
  /** Documento del profesional que ejecutó el servicio */
  professionalDocument?: string
  professionalName?: string
  toothNumber?: number
  sourceType?: 'budget' | 'evolution' | 'consultation' | 'manual'
  sourceId?: string
}

/** Factura electrónica de venta en salud (FEV) */
export interface ElectronicInvoice {
  id: string
  /** Número completo FEV (prefijo + consecutivo o número único) */
  invoiceNumber: string
  invoicePrefix?: string
  consecutiveNumber?: number
  issueDate: string
  dueDate?: string
  /** Código Único de Factura Electrónica (DIAN) */
  cufe?: string | null
  /** Código Único de Validación (MinSalud / MUV) */
  cuv?: string | null
  cuvRecordId?: string | null
  status: InvoiceStatus

  // Emisor (prestador)
  issuerNit: string
  issuerBusinessName: string

  // Adquiriente (paciente / pagador)
  buyerDocumentType: string
  buyerDocumentNumber: string
  buyerName: string

  /** Campos sector salud */
  healthSector: HealthSectorInvoiceFields

  /** Totales DIAN — incluyen CUPS + personalizados */
  subtotal: number
  discountTotal: number
  copayTotal: number
  /** Neto a pagar después de descuentos y copagos */
  netPayable: number
  currency: 'COP'

  items: InvoiceItem[]

  /** Total reportado en RIPS (solo líneas con CUPS válido) */
  ripsReportableTotal: number
  /** Cantidad de líneas excluidas del RIPS */
  ripsExcludedLineCount: number

  /** Vínculos clínicos */
  patientId: string
  professionalId: string
  clinicalRecordIds: string[]
  evolutionNoteIds?: string[]

  /** Snapshot RIPS JSON asociado */
  ripsJson?: RipsTransaction | null

  createdAt: string
  updatedAt: string
  submittedAt?: string | null
  validatedAt?: string | null
  rejectionReason?: string | null
  /** Nota crédito que anula esta FEV (inmutabilidad DIAN). */
  creditNoteId?: string | null
  creditNoteNumber?: string | null
  voidReason?: string | null
}

export interface InvoiceValidationIssue {
  level: 'error' | 'warning'
  field?: string
  message: string
  itemId?: string
}

export interface InvoiceTotals {
  subtotal: number
  discountTotal: number
  copayTotal: number
  taxTotal: number
  netPayable: number
  ripsReportableTotal: number
  dianTotal: number
  ripsExcludedLineCount: number
}

export interface InvoiceDraftInput {
  patientId: string
  clinicalRecordId: string | number
  professional: import('./user').UserProfile
  patient: import('./patient').Patient
  record: import('./clinicalRecord').ClinicalRecord
  invoiceNumber: string
  issueDate?: string
  catalogLookup?: import('@/utils/ripsCompiler').EvolutionCatalogLookup
  healthSector?: Partial<HealthSectorInvoiceFields>
  consultationUnitPrice?: number
  includeConsultation?: boolean
}

export interface BuildRipsJsonOptions {
  invoice: ElectronicInvoice
  sources: import('@/utils/rips').RipsSourceRecord[]
  professional: import('./user').UserProfile
  metadata: import('./rips').RipsExportMetadata
  catalogLookup?: import('@/utils/ripsCompiler').EvolutionCatalogLookup
}

export interface BuildRipsJsonResult {
  rips: RipsTransaction
  issues: import('./rips').RipsValidationIssue[]
  ripsReportableTotal: number
  excludedLineCount: number
  excludedItems: InvoiceItem[]
}
