/**
 * Tributo IVA para servicios de salud y odontología.
 * Estatuto Tributario de Colombia, Art. 476: operaciones EXCLUIDAS de IVA
 * (no gravadas al 19 %). Código DIAN de tributo IVA = `01`, tarifa `0.00%`.
 */

export const DIAN_IVA_TRIBUTO_CODIGO = '01'
export const DIAN_IVA_TRIBUTO_NOMBRE = 'IVA'
export const DIAN_IVA_EXCLUIDO_TARIFA = 0
export const DIAN_IVA_EXCLUIDO_PERCENT = '0.00'
export const DIAN_IVA_EXCLUIDO_REGIMEN = 'excluido'
export const DIAN_IVA_EXCLUIDO_NORMA = 'Estatuto Tributario Art. 476'

function money(value) {
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) return 0
  return Math.round(n * 100) / 100
}

/**
 * Desglose tributario DIAN para atención odontológica excluida de IVA.
 * BaseImponible = ValorTotal; ValorImpuesto = 0.00
 *
 * @param {number} valorTotal
 */
export function buildExcludedIvaBreakdown(valorTotal) {
  const total = money(valorTotal)
  return {
    tributoCodigo: DIAN_IVA_TRIBUTO_CODIGO,
    tributoNombre: DIAN_IVA_TRIBUTO_NOMBRE,
    tarifa: DIAN_IVA_EXCLUIDO_TARIFA,
    tarifaPercent: `${DIAN_IVA_EXCLUIDO_PERCENT}%`,
    baseImponible: total,
    valorImpuesto: 0,
    valorTotal: total,
    regimen: DIAN_IVA_EXCLUIDO_REGIMEN,
    norma: DIAN_IVA_EXCLUIDO_NORMA,
  }
}
