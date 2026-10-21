/**
 * Numeración legal de la FEV en el sustituto local del proveedor.
 * No lee ni escribe consecutivos_prestador.
 */
const secuenciasPorClave = new Map()

/**
 * @param {string} apiKey
 * @param {unknown} [solicitado] Número ya emitido por el proveedor, para reintentos.
 * @returns {string}
 */
export function numeroFevDelProveedor(apiKey, solicitado) {
  const clave = String(apiKey ?? '').trim()
  if (clave.length < 8) {
    const error = new Error('Se requiere la clave del tenant de marca blanca.')
    error.statusCode = 400
    throw error
  }
  const actual = String(solicitado ?? '').trim()
  if (/^FE-\d{5,}$/.test(actual)) return actual

  const next = (secuenciasPorClave.get(clave) ?? 0) + 1
  secuenciasPorClave.set(clave, next)
  return `FE-${String(next).padStart(5, '0')}`
}
