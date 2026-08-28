import type { RipsTransaction } from './rips'

/** Documento JSON unificado FEV-Salud (DIAN + MinSalud Res. 2275/2023). */
export interface HealthElectronicInvoiceDocument {
  schemaVersion: '2026.1'
  generatedAt: string
  dian: DianInvoiceGeneralData
  salud: MinSaludHealthSectorData
  economicDetail: InvoiceEconomicDetail
  clinicalTraceability: InvoiceClinicalTraceability
  rips?: RipsTransaction | null
  cuv?: string | null
  cufe?: string | null
}

export interface DianBillingResolution {
  resolutionNumber?: string
  prefix?: string
  authorizedRangeFrom?: number
  authorizedRangeTo?: number
  validFrom?: string
  validUntil?: string
}

export interface DianInvoiceGeneralData {
  invoiceNumber: string
  issueDate: string
  issueTime: string
  paymentForm: 'contado' | 'credito'
  paymentMeans: 'efectivo' | 'transferencia' | 'tarjeta' | 'pse' | 'otro'
  currency: 'COP'
  issuer: {
    businessName: string
    nit: string
    nitVerificationDigit?: string
    address?: string
    city?: string
    municipalityCode?: string
    taxRegime?: string
    billingResolution?: DianBillingResolution
  }
  buyer: {
    documentType: string
    documentNumber: string
    fullName: string
    address?: string
    phone?: string
    email?: string
  }
}

export interface MinSaludHealthSectorData {
  cuv: string | null
  codPrestadorReps: string
  modalidadPago: string
  coberturaPlanBeneficios: string
  tipoUsuario: string
  numAutorizacion?: string | null
  conceptoRecaudo?: string
  valorPagoModerador?: number
  numFEVPagoModerador?: string | null
  procedures: Array<{
    lineNumber: number
    cupsCode: string | null
    description: string
    cie10Code: string | null
    cie10Description: string | null
    quantity: number
    unitPrice: number
    discountAmount: number
    copayAmount: number
    totalAmount: number
    attentionDate?: string
    professionalDocument?: string
    professionalName?: string
    reportableInRips: boolean
  }>
}

export interface InvoiceEconomicDetail {
  subtotal: number
  discountTotal: number
  taxTotal: number
  copayTotal: number
  netPayable: number
  ripsReportableTotal: number
  ripsExcludedLineCount: number
  /** Desglose IVA DIAN — servicios de salud excluidos (ET Art. 476). */
  iva: {
    tributoCodigo: '01'
    tributoNombre: 'IVA'
    tarifa: number
    tarifaPercent: string
    baseImponible: number
    valorImpuesto: number
    valorTotal: number
    regimen: 'excluido'
    norma: string
  }
}

export interface InvoiceClinicalTraceability {
  patientId: string
  professionalId: string
  clinicalRecordIds: string[]
  evolutionNoteIds: string[]
  appointmentIds?: string[]
}
