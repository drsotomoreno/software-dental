/** Respuesta del API de validación RIPS / obtención CUV */

export interface RipsMinistryError {
  code?: string
  field?: string
  message: string
  line?: number
}

export interface RipsValidateRequestMetadatos {
  patientUuid?: string
  clinicalRecordIds?: string[]
  patientDocument?: string
  perfilFiscal?: import('@/utils/fiscalProfile').FiscalProfile
  esRipsTemporal?: boolean
  allowNullNumFactura?: boolean
}

export interface RipsValidateRequest {
  rips: import('./rips').RipsTransaction
  metadatos?: RipsValidateRequestMetadatos
  invoice?: DianInvoicePayload
}

export interface DianInvoicePayload {
  nitEmisor: string
  razonSocialEmisor: string
  nitAdquiriente: string
  razonSocialAdquiriente: string
  issueDate: string
  payableAmount: number
  codPrestadorReps?: string
  lines?: Array<{
    description: string
    quantity: number
    unitPrice: number
    cupsCode?: string
  }>
}

export interface RipsValidateSuccessResponse {
  success: true
  approved: true
  cuv: string
  cufe?: string
  procesoId?: string
  fechaRadicacion?: string
  estado?: string
  source: 'sandbox' | 'minsalud' | 'local' | 'dian'
  localWarnings?: import('./rips').RipsValidationIssue[]
  cuvRecordId: string
  dianXml?: string
  estado_dian?: import('./dualValidation').EstadoDian
  codigo_cufe?: string | null
  estado_muv?: import('./dualValidation').EstadoMuv
  codigo_cuv?: string | null
  detalles_rechazo_muv?: RipsMinistryError[]
  legalizada?: boolean
}

export interface RipsValidateErrorResponse {
  success: false
  approved: false
  source?: string
  localIssues?: import('./rips').RipsValidationIssue[]
  ministryErrors?: RipsMinistryError[]
  error?: string
  cufe?: string | null
  estado_dian?: import('./dualValidation').EstadoDian
  codigo_cufe?: string | null
  estado_muv?: import('./dualValidation').EstadoMuv
  codigo_cuv?: string | null
  detalles_rechazo_muv?: RipsMinistryError[]
  legalizada?: boolean
  failedStep?: 'dian' | 'rips_cufe' | 'muv'
}

export type RipsValidateResponse = RipsValidateSuccessResponse | RipsValidateErrorResponse

export interface RipsCuvStoredRecord {
  id: string
  cuv: string
  numFactura: string | null
  numDocumentoIdObligado: string
  status: 'approved' | 'rejected' | 'pending'
  procesoId?: string
  fechaRadicacion?: string
  estado?: string
  source?: string
  patientUuid?: string | null
  clinicalRecordIds?: string[]
  createdAt: string
}
