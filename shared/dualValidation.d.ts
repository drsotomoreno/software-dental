export const ESTADO_DIAN: {
  readonly PENDIENTE: 'Pendiente'
  readonly APROBADO: 'Aprobado'
  readonly RECHAZADO: 'Rechazado'
}
export const ESTADO_MUV: {
  readonly PENDIENTE_ENVIO: 'Pendiente_Envio'
  readonly APROBADO_CON_CUV: 'Aprobado_Con_CUV'
  readonly RECHAZADO_POR_MUV: 'Rechazado_Por_MUV'
}
export type EstadoDian = (typeof ESTADO_DIAN)[keyof typeof ESTADO_DIAN]
export type EstadoMuv = (typeof ESTADO_MUV)[keyof typeof ESTADO_MUV]
export const ESTADO_DIAN_VALUES: EstadoDian[]
export const ESTADO_MUV_VALUES: EstadoMuv[]
export const DEFAULT_ESTADO_DIAN: EstadoDian
export const DEFAULT_ESTADO_MUV: EstadoMuv
export function normalizeEstadoDian(value?: unknown): EstadoDian
export function normalizeEstadoMuv(value?: unknown): EstadoMuv
export function isDianApproved(value?: unknown): boolean
export function isMuvApprovedWithCuv(value?: unknown): boolean
export function isTransactionLegalizada(record?: {
  estado_dian?: unknown
  codigo_cufe?: unknown
  estado_muv?: unknown
  codigo_cuv?: unknown
}): boolean
export function injectCufeIntoRips<T extends object>(rips: T | null | undefined, cufe: string): T & { cufe: string }
export function sumRipsVrServicio(rips?: object | null): number
export function roundCents(value: unknown): number
export function amountsMatchToTheCent(dianAmount: unknown, ripsAmount: unknown): boolean
export function emptyDualValidationFields(): {
  estado_dian: EstadoDian
  codigo_cufe: null
  estado_muv: EstadoMuv
  codigo_cuv: null
  detalles_rechazo_muv: []
}
