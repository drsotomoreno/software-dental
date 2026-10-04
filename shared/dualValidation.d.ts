export const ESTADO_DIAN: {
  readonly PENDIENTE: 'Pendiente'
  readonly APROBADO: 'Aprobado'
  readonly RECHAZADO: 'Rechazado'
}

export const ESTADO_MINSALUD_MUV: {
  readonly PENDIENTE_ENVIO: 'Pendiente_Envio'
  readonly APROBADO: 'Aprobado'
  readonly RECHAZADO_CON_GLOSAS: 'Rechazado_Con_Glosas'
}

export type EstadoDian = (typeof ESTADO_DIAN)[keyof typeof ESTADO_DIAN]
export type EstadoMinsaludMuv = (typeof ESTADO_MINSALUD_MUV)[keyof typeof ESTADO_MINSALUD_MUV]

export const ESTADO_DIAN_VALUES: EstadoDian[]
export const ESTADO_MINSALUD_MUV_VALUES: EstadoMinsaludMuv[]

export interface MuvRejectionDetail {
  code?: string
  field?: string
  message: string
  line?: number
}

export interface DualValidationFields {
  estado_dian: EstadoDian
  codigo_cufe: string | null
  cufe?: string | null
  estado_minsalud_muv: EstadoMinsaludMuv
  codigo_cuv: string | null
  cuv?: string | null
  detalles_rechazo_muv: MuvRejectionDetail[]
}

export function hasOfficialRipsPackage(rips: unknown): boolean
export function syncDualValidationAliases<T extends object>(
  record?: T | null,
): T & DualValidationFields
export function isListoParaEntrega(record?: DualValidationFields | object | null): boolean
export function invoiceStatusFromDualValidation(
  record?: DualValidationFields | object | null,
): 'rejected' | 'cuv_approved' | 'dian_sent' | 'submitted'
