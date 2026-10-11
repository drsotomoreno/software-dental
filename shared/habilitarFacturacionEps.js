/**
 * Ajuste de clínica `habilitar_facturacion_eps` (boolean, por defecto false).
 * Apagado: odontólogo particular. No ve la exportación masiva de RIPS;
 * el envío sin factura corre en segundo plano al cerrar cada evolución.
 * Encendido: la clínica factura a EPS y puede usar la pantalla masiva.
 */

export const HABILITAR_FACTURACION_EPS_FIELD = 'habilitar_facturacion_eps'

const PATCH_KEYS = ['habilitarFacturacionEps', 'habilitar_facturacion_eps', 'tipo_flujo_rips']

/**
 * @param {unknown} value
 * @returns {boolean}
 */
export function isHabilitarFacturacionEps(value) {
  return value === true || value === 1 || value === '1' || value === 'true'
}

/**
 * Lee el ajuste si el objeto lo trae. `undefined` cuando el parche no lo menciona.
 * @param {unknown} source
 * @returns {boolean | undefined}
 */
export function readHabilitarFacturacionEpsPatch(source) {
  if (!source || typeof source !== 'object') return undefined
  for (const key of PATCH_KEYS) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      return isHabilitarFacturacionEps(/** @type {Record<string, unknown>} */ (source)[key])
    }
  }
  return undefined
}

/**
 * Valor efectivo del ajuste. Ausente o inválido equivale a false.
 * @param {unknown} source
 * @returns {boolean}
 */
export function readHabilitarFacturacionEps(source) {
  const patched = readHabilitarFacturacionEpsPatch(source)
  if (patched !== undefined) return patched
  if (typeof source === 'boolean' || typeof source === 'number' || typeof source === 'string') {
    return isHabilitarFacturacionEps(source)
  }
  return false
}
