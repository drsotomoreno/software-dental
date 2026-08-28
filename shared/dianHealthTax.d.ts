export const DIAN_IVA_TRIBUTO_CODIGO: '01'
export const DIAN_IVA_TRIBUTO_NOMBRE: 'IVA'
export const DIAN_IVA_EXCLUIDO_TARIFA: 0
export const DIAN_IVA_EXCLUIDO_PERCENT: '0.00'
export const DIAN_IVA_EXCLUIDO_REGIMEN: 'excluido'
export const DIAN_IVA_EXCLUIDO_NORMA: string

export interface ExcludedIvaBreakdown {
  tributoCodigo: '01'
  tributoNombre: 'IVA'
  tarifa: 0
  tarifaPercent: string
  baseImponible: number
  valorImpuesto: 0
  valorTotal: number
  regimen: 'excluido'
  norma: string
}

export function buildExcludedIvaBreakdown(valorTotal: number): ExcludedIvaBreakdown
