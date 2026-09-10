/**
 * Perfil fiscal del prestador (clínica / IPS / profesional independiente).
 * Res. 2275 / FEV-Salud: el no obligado radica RIPS con numFactura = null.
 */

export const PERFIL_FISCAL_OBLIGADO_FEV = 'Obligado_FEV'
export const PERFIL_FISCAL_NO_OBLIGADO = 'No_Obligado'

/** @typedef {'Obligado_FEV' | 'No_Obligado'} FiscalProfile */

export const PERFIL_FISCAL_VALUES = [PERFIL_FISCAL_OBLIGADO_FEV, PERFIL_FISCAL_NO_OBLIGADO]

export const DEFAULT_PERFIL_FISCAL = PERFIL_FISCAL_OBLIGADO_FEV

export const PERFIL_FISCAL_NO_OBLIGADO_NOTICE =
  'Sus RIPS se enviarán mensualmente sin factura.'

export const PERFIL_FISCAL_OPTIONS = [
  {
    id: PERFIL_FISCAL_OBLIGADO_FEV,
    label: 'Obligado a factura electrónica (FEV)',
    hint: 'IPS o profesional con ingresos iguales o superiores a 3.500 UVT. El RIPS lleva el número de la FEV DIAN.',
  },
  {
    id: PERFIL_FISCAL_NO_OBLIGADO,
    label: 'Profesional Independiente < 3.500 UVT',
    hint: 'No obligado a facturar electrónicamente. Los RIPS se reportan al Ministerio sin número de factura.',
    notice: PERFIL_FISCAL_NO_OBLIGADO_NOTICE,
  },
]

/**
 * @param {unknown} value
 * @returns {FiscalProfile}
 */
export function normalizePerfilFiscal(value) {
  if (value === false || value === 0) return PERFIL_FISCAL_NO_OBLIGADO
  if (value === true || value === 1) return PERFIL_FISCAL_OBLIGADO_FEV

  const raw = String(value ?? '')
    .trim()
    .replace(/[\s-]+/g, '_')

  const lowered = raw.toLowerCase()
  if (
    raw === PERFIL_FISCAL_NO_OBLIGADO ||
    lowered === 'no_obligado' ||
    lowered === 'false' ||
    raw === '0' ||
    lowered.includes('3.500') ||
    lowered.includes('3500')
  ) {
    return PERFIL_FISCAL_NO_OBLIGADO
  }

  if (
    raw === PERFIL_FISCAL_OBLIGADO_FEV ||
    raw.toLowerCase() === 'obligado_fev' ||
    raw.toLowerCase() === 'true' ||
    raw === '1'
  ) {
    return PERFIL_FISCAL_OBLIGADO_FEV
  }

  return DEFAULT_PERFIL_FISCAL
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
export function isNoObligadoFev(value) {
  return normalizePerfilFiscal(value) === PERFIL_FISCAL_NO_OBLIGADO
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
export function isObligadoFev(value) {
  return normalizePerfilFiscal(value) === PERFIL_FISCAL_OBLIGADO_FEV
}

/**
 * Null en numFactura es válido para no obligados y para RIPS temporales (pre-FEV).
 * @param {unknown} perfilFiscal
 * @param {{ allowNullNumFactura?: boolean, esRipsTemporal?: boolean }} [options]
 * @returns {boolean}
 */
export function allowsNullNumFactura(perfilFiscal, options = {}) {
  if (options.allowNullNumFactura === true || options.esRipsTemporal === true) return true
  return isNoObligadoFev(perfilFiscal)
}

/**
 * Normaliza el número de FEV: cadena vacía o ausente → null.
 * @param {unknown} value
 * @returns {string | null}
 */
export function normalizeRipsNumFactura(value) {
  if (value == null) return null
  const trimmed = String(value).trim()
  return trimmed === '' ? null : trimmed
}
