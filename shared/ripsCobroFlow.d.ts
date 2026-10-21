export const FLUJO_RIPS_CON_FEV: 'con_fev'
export const FLUJO_RIPS_SIN_FEV_RECIBO: 'sin_fev_recibo'
export const FLUJO_RIPS_SIN_FEV_CERO: 'sin_fev_cero'
export const RECIBO_CAJA_PREFIJO: string
export const RECIBO_CAJA_DIGITOS: number
export const TIPO_DOC_RECIBO_CAJA: 'RECIBO_CAJA'
export const TIPO_DOC_CUENTA_COBRO: 'CUENTA_COBRO'
export const RIPS_RECIBO_CAJA_PATTERN: RegExp
export const RIPS_FEV_CON_GUION_PATTERN: RegExp

export type FlujoRipsCobro = 'con_fev' | 'sin_fev_recibo' | 'sin_fev_cero'

export function formatNumeroReciboCaja(consecutivo: number): string
export function isNumeroReciboCaja(value?: unknown): boolean
export function isNumeroFevOficial(value?: unknown): boolean
export function valorAtencionDe(value?: unknown): number | null
export function sumVrServicioRips(rips?: { usuarios?: Array<{ servicios?: Record<string, Array<{ vrServicio?: unknown }>> }> }): number | null
export function resolveRipsCobroFlujo(input?: {
  perfilFiscal?: unknown
  valorAtencion?: unknown
  atencionCero?: boolean
  emisionVoluntaria?: boolean
}): FlujoRipsCobro
export function validateNumFacturaDelFlujo(input: {
  flujo: FlujoRipsCobro
  numFactura?: unknown
  cufe?: unknown
  fevReferencia?: unknown
}): { valid: boolean; message?: string }
