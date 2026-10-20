import { isObligadoFev } from '../../shared/fiscalProfile.js'

/**
 * El botón de la nota manda con `modo`.
 * Sin modo, el dictado conserva la regla anterior: sin factura y no obligado → MUV.
 * @param {{ modo?: unknown, invoice?: unknown, perfilFiscal?: unknown }} input
 * @returns {'muv_sin_factura' | 'con_factura'}
 */
export function resolverModoEvolucionDictada(input) {
  const modo = input?.modo === 'sin_factura' || input?.modo === 'con_factura' ? input.modo : null
  if (modo === 'sin_factura') return 'muv_sin_factura'
  if (modo === 'con_factura') return 'con_factura'
  if (!input?.invoice && !isObligadoFev(input?.perfilFiscal)) return 'muv_sin_factura'
  return 'con_factura'
}
