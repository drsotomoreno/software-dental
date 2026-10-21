/**
 * Flujos RIPS Res. 2275: con FEV, recibo interno del no obligado, o atención a $0.
 */
import { isObligadoFev } from './fiscalProfile.js'

/** Mismo criterio que RIPS_FEV_NUMERO_PATTERN: prefijo sin guion + consecutivo. */
const RIPS_FEV_SIN_GUION = /^[A-Za-z][A-Za-z0-9]{0,3}\d{1,20}$/

export const FLUJO_RIPS_CON_FEV = 'con_fev'
export const FLUJO_RIPS_SIN_FEV_RECIBO = 'sin_fev_recibo'
export const FLUJO_RIPS_SIN_FEV_CERO = 'sin_fev_cero'

export const RECIBO_CAJA_PREFIJO = 'RC-'
export const RECIBO_CAJA_DIGITOS = 5
export const TIPO_DOC_RECIBO_CAJA = 'RECIBO_CAJA'
export const TIPO_DOC_CUENTA_COBRO = 'CUENTA_COBRO'

export const RIPS_RECIBO_CAJA_PATTERN = /^RC-\d{5}$/
export const RIPS_FEV_CON_GUION_PATTERN = /^FE-\d{5,}$/

/**
 * @param {number} consecutivo
 * @returns {string}
 */
export function formatNumeroReciboCaja(consecutivo) {
  const number = Number(consecutivo)
  if (!Number.isInteger(number) || number < 1) {
    throw new Error('El consecutivo del recibo de caja debe ser un entero mayor que cero.')
  }
  return `${RECIBO_CAJA_PREFIJO}${String(number).padStart(RECIBO_CAJA_DIGITOS, '0')}`
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
export function isNumeroReciboCaja(value) {
  return RIPS_RECIBO_CAJA_PATTERN.test(String(value ?? '').trim())
}

/**
 * Número oficial de FEV: `FE-00012` o el formato DIAN sin guion (FV12345).
 * @param {unknown} value
 * @returns {boolean}
 */
export function isNumeroFevOficial(value) {
  const numero = String(value ?? '').trim()
  if (!numero) return false
  return RIPS_FEV_CON_GUION_PATTERN.test(numero) || RIPS_FEV_SIN_GUION.test(numero)
}

/**
 * @param {unknown} value
 * @returns {number | null}
 */
export function valorAtencionDe(value) {
  if (value == null || value === '') return null
  const number = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(number)) return null
  return number
}

/**
 * @param {object} [rips]
 * @returns {number | null}
 */
export function sumVrServicioRips(rips) {
  let total = 0
  let seen = false
  for (const usuario of rips?.usuarios ?? []) {
    const servicios = usuario?.servicios ?? {}
    for (const key of ['consultas', 'procedimientos', 'otrosServicios', 'medicamentos']) {
      for (const item of servicios[key] ?? []) {
        const valor = valorAtencionDe(item?.vrServicio)
        if (valor == null) continue
        seen = true
        total += valor
      }
    }
  }
  return seen ? total : null
}

/**
 * @param {{
 *   perfilFiscal?: unknown,
 *   valorAtencion?: unknown,
 *   atencionCero?: boolean,
 *   emisionVoluntaria?: boolean,
 * }} [input]
 * @returns {'con_fev' | 'sin_fev_recibo' | 'sin_fev_cero'}
 */
export function resolveRipsCobroFlujo(input = {}) {
  const valor = valorAtencionDe(input.valorAtencion)
  const cero = input.atencionCero === true || (valor != null && valor <= 0)
  if (cero) return FLUJO_RIPS_SIN_FEV_CERO
  if (isObligadoFev(input.perfilFiscal) || input.emisionVoluntaria === true) {
    return FLUJO_RIPS_CON_FEV
  }
  return FLUJO_RIPS_SIN_FEV_RECIBO
}

/**
 * @param {{
 *   flujo: 'con_fev' | 'sin_fev_recibo' | 'sin_fev_cero',
 *   numFactura?: unknown,
 *   cufe?: unknown,
 *   fevReferencia?: unknown,
 * }} input
 * @returns {{ valid: boolean, message?: string }}
 */
export function validateNumFacturaDelFlujo(input) {
  const numero = String(input.numFactura ?? '').trim()
  const cufe = String(input.cufe ?? '').trim()
  const referencia = String(input.fevReferencia ?? '').trim()

  if (input.flujo === FLUJO_RIPS_SIN_FEV_CERO) {
    if (numero) {
      return {
        valid: false,
        message: 'La atención a $0 lleva numFactura null. No exige FEV ni recibo de caja.',
      }
    }
    if (cufe) {
      return { valid: false, message: 'La atención a $0 no lleva CUFE ni interacción con la DIAN.' }
    }
    return { valid: true }
  }

  if (input.flujo === FLUJO_RIPS_SIN_FEV_RECIBO) {
    if (!isNumeroReciboCaja(numero)) {
      return {
        valid: false,
        message: 'El no obligado con cobro requiere numFactura igual al recibo de caja (RC-XXXXX).',
      }
    }
    if (isNumeroFevOficial(numero) && !isNumeroReciboCaja(numero)) {
      return { valid: false, message: 'El flujo sin FEV no acepta un número de factura electrónica.' }
    }
    if (cufe) {
      return {
        valid: false,
        message: 'El RIPS del no obligado se radica sin CUFE y sin interacción con la DIAN.',
      }
    }
    return { valid: true }
  }

  if (!isNumeroFevOficial(numero)) {
    return {
      valid: false,
      message: 'numFactura debe ser el número oficial de la FEV (FE-00012 o el que devuelva la DIAN).',
    }
  }
  if (isNumeroReciboCaja(numero)) {
    return { valid: false, message: 'La FEV no usa el consecutivo interno RC-.' }
  }
  if (!cufe) {
    return { valid: false, message: 'La FEV exige CUFE para el cruce ante la DIAN y el MUV.' }
  }
  if (referencia && referencia !== numero) {
    return {
      valid: false,
      message: `numFactura («${numero}») debe coincidir 1:1 con la FEV reportada ante la DIAN («${referencia}»).`,
    }
  }
  return { valid: true }
}
