import type { RipsTransaction } from './rips'
import type { ElectronicInvoice, InvoiceItem } from './invoice'
import type { RipsValidateResponse } from './ripsCuv'

/** Ítem de evolución clínica normalizado para facturación y RIPS */
export interface ClinicalEvolutionItem {
  id: string
  procedureName: string
  cupsCode?: string | null
  cie10Code?: string | null
  cie10Description?: string | null
  isCustomProcedure: boolean
  /** Costo de la atención — 0 implica RIPS sí (si CUPS), FEV DIAN no */
  cost: number
  /** false = control, garantía, valoración gratuita */
  isBillable: boolean
  providerId: string
  providerDocument?: string
  providerName?: string
  attentionDate: string
  attentionEndDate?: string
  /** Snapshot catálogo — servicios sin CUPS RIPS */
  requiereCupsRips?: boolean
  sourceType: 'evolution' | 'budget' | 'consultation'
  sourceId: string
}

/** Procedimiento RIPS simplificado para reglas de negocio */
export interface RipsProcedureItem {
  codProcedimiento: string
  codDiagnosticoPrincipal: string
  fechaInicioAtencion: string
  fechaFinAtencion?: string
  vrServicio: number
  consecutivo?: number
  sourceId?: string
}

/** Payload RIPS JSON oficial MinSalud (alias semántico) */
export type RipsJsonPayload = RipsTransaction

export type ClinicalSessionPipeline = 'rips_only' | 'rips_and_dian'

export interface PatientBillingData {
  documentType: string
  documentNumber: string
  fullName: string
  tipoUsuario: string
}

export interface IssuerBillingData {
  businessName: string
  nit: string
  nitDv?: string
  codPrestadorReps: string
}

export interface BillingValidationIssue {
  level: 'error' | 'warning'
  field?: string
  message: string
  itemId?: string
}

export interface ProcessClinicalSessionInput {
  sessionId: string
  patient: import('./patient').Patient
  record: import('./clinicalRecord').ClinicalRecord
  professional: import('./user').UserProfile
  evolutionNoteIds?: string[]
  invoiceNumber?: string
  catalogLookup?: import('@/utils/ripsCompiler').EvolutionCatalogLookup
  submitToMinistry?: boolean
}

export interface ProcessClinicalSessionResult {
  sessionId: string
  clinicalItems: ClinicalEvolutionItem[]
  pipeline: ClinicalSessionPipeline
  requiresDianBilling: boolean
  invoice: ElectronicInvoice | null
  ripsPayload: RipsJsonPayload
  ripsProcedureItems: RipsProcedureItem[]
  dianTotal: number
  ripsReportableTotal: number
  validationIssues: BillingValidationIssue[]
  ministryResponse?: RipsValidateResponse
  cuv?: string | null
  cufe?: string | null
}

/** Factura simplificada para API externa */
export interface Invoice {
  id: string
  emisorReps: string
  patientData: PatientBillingData
  totalAmount: number
  paymentMethod: string
  cufe?: string | null
  cuv?: string | null
  items: InvoiceItem[]
  status: ElectronicInvoice['status']
}
