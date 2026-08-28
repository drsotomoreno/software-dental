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
  procesoId?: string
  fechaRadicacion?: string
  estado?: string
  source: 'sandbox' | 'minsalud' | 'local'
  localWarnings?: import('./rips').RipsValidationIssue[]
  cuvRecordId: string
  dianXml?: string
}

export interface RipsValidateErrorResponse {
  success: false
  approved: false
  source?: string
  localIssues?: import('./rips').RipsValidationIssue[]
  ministryErrors?: RipsMinistryError[]
  error?: string
}

export type RipsValidateResponse = RipsValidateSuccessResponse | RipsValidateErrorResponse

export interface RipsCuvStoredRecord {
  id: string
  cuv: string
  numFactura: string
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
