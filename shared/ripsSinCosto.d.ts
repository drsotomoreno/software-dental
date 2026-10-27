export const TIPO_USUARIO_PARTICULAR: '04'
export const CONCEPTO_RECAUDO_NO_APLICA: '05'
export const ESTADO_PROCESADO: 'PROCESADO'
export const MUV_PRODUCCION_BASE: string

export type MotivoSinCosto = 'control' | 'garantia' | 'cortesia'

export const PREFIJOS_SIN_COSTO: Record<MotivoSinCosto, string>

export function sinAcentos(value: unknown): string
export function esPrefijoSinCosto(value: unknown): boolean
export function motivoSinCostoDe(value: unknown): MotivoSinCosto
export function prefijoTransmisionSinCosto(motivo: unknown): string
export function etiquetaMotivoSinCosto(motivo: unknown): string
export function numeroPaqueteSinCosto(prefijo: string, consecutivo: number): string

export interface ValoresFinancierosCostoCero {
  valorProcedimiento: 0
  valorDescuento: 0
  valorNeto: 0
  vrServicio: 0
  valorPagoModerador: 0
  conceptoRecaudo: '05'
}

export function valoresFinancierosCostoCero(): ValoresFinancierosCostoCero
export function esEvolucionSinCosto(evolucion: object | null | undefined): boolean
export function sesionEsSinCosto(evoluciones: readonly object[] | null | undefined): boolean

export interface ResultadoSumatoriaAgrupador {
  ok: boolean
  valorTotal: number
  suma: number
  permiteCero: boolean
  message: string
}

export function validarSumatoriaAgrupador(input?: {
  valorTotal?: unknown
  items?: Array<{ valorNeto?: unknown; vrServicio?: unknown }>
  numero?: string
}): ResultadoSumatoriaAgrupador
