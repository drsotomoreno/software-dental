/** Respuesta del API de validación RIPS / obtención CUV */

import type {
  EstadoDian,
  EstadoMinsaludMuv,
  MuvRejectionDetail,
} from '@/utils/dualValidation'
import type { RipsTransaction } from './rips'

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
  cufe?: string | null
  codigo_cufe?: string | null
  codigo_cuv?: string | null
  estado_dian?: EstadoDian
  estado_minsalud_muv?: EstadoMinsaludMuv
  detalles_rechazo_muv?: MuvRejectionDetail[]
  listoParaEntrega?: boolean
  procesoId?: string
  fechaRadicacion?: string
  estado?: string
  source: 'sandbox' | 'minsalud' | 'local' | 'dian'
  localWarnings?: import('./rips').RipsValidationIssue[]
  cuvRecordId: string
  dianXml?: string
  rips?: RipsTransaction
}

export interface RipsValidateErrorResponse {
  success: false
  approved: false
  source?: string
  localIssues?: import('./rips').RipsValidationIssue[]
  ministryErrors?: RipsMinistryError[]
  error?: string
  cufe?: string | null
  cuv?: string | null
  codigo_cufe?: string | null
  codigo_cuv?: string | null
  estado_dian?: EstadoDian
  estado_minsalud_muv?: EstadoMinsaludMuv
  detalles_rechazo_muv?: MuvRejectionDetail[]
  listoParaEntrega?: boolean
  cuvRecordId?: string
  dianXml?: string
  rips?: RipsTransaction
}

export type RipsValidateResponse = RipsValidateSuccessResponse | RipsValidateErrorResponse

export interface DualValidationApiResponse {
  ok: boolean
  success: boolean
  approved: boolean
  listoParaEntrega: boolean
  route?: string
  perfilFiscal?: string
  numFactura?: string | null
  codigo_cufe?: string | null
  cufe?: string | null
  estado_dian: EstadoDian
  codigo_cuv?: string | null
  cuv?: string | null
  estado_minsalud_muv: EstadoMinsaludMuv
  detalles_rechazo_muv?: MuvRejectionDetail[]
  cuvRecordId?: string
  dianXml?: string | null
  qrUrl?: string | null
  rips?: RipsTransaction
  localIssues?: import('./rips').RipsValidationIssue[]
  ministryErrors?: RipsMinistryError[]
  error?: string
  source?: string
}

export interface RipsCuvStoredRecord {
  id: string
  cuv: string
  codigo_cuv?: string | null
  cufe?: string | null
  codigo_cufe?: string | null
  estado_dian?: EstadoDian
  estado_minsalud_muv?: EstadoMinsaludMuv
  detalles_rechazo_muv?: MuvRejectionDetail[]
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
  updatedAt?: string
}
