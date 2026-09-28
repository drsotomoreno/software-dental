/** CodigoUnicoValidacion del MUV: 96 caracteres hexadecimales. */
export const CUV_HEX = /^[0-9a-fA-F]{96}$/

const NOMBRE_APROBADO = /ResultadosMSPS_.+_A_CUV(?:\.txt)?$/i
const FACTURA_EN_NOMBRE = /ResultadosMSPS_(.+)_([^_]+)_A_CUV(?:\.txt)?$/i

export function esCuvOficial(value) {
  return CUV_HEX.test(String(value ?? '').replace(/\s+/g, ''))
}

export function normalizarCuv(value) {
  const compacto = String(value ?? '').replace(/[\s-]+/g, '')
  return esCuvOficial(compacto) ? compacto.toLowerCase() : null
}

/**
 * El cliente-servidor nombra el aprobado como ResultadosMSPS_[factura]_[ID]_A_CUV.txt.
 * La factura puede incluir guiones; el ID es el último tramo antes de _A_CUV.
 */
export function facturaDesdeNombreResultados(nombreArchivo) {
  const base = String(nombreArchivo ?? '').split(/[/\\]/).pop() ?? ''
  const match = base.match(FACTURA_EN_NOMBRE)
  return match?.[1] ?? null
}

export function archivoIndicaAprobacion(nombreArchivo) {
  const base = String(nombreArchivo ?? '').split(/[/\\]/).pop() ?? ''
  return NOMBRE_APROBADO.test(base) || base.includes('_A_CUV')
}

/**
 * Extrae el CUV del texto del Ministerio.
 * Acepta el código solo, `CUV: <96 hex>` o `CodigoUnicoValidacion: <96 hex>`.
 */
export function extraerCuvDeTexto(contenido) {
  const texto = String(contenido ?? '')
  const etiquetas = [
    /CodigoUnicoValidacion[:\s]+([0-9a-fA-F\s-]{96,120})/i,
    /CUV[:\s]+([0-9a-fA-F\s-]{96,120})/i,
  ]
  for (const patron of etiquetas) {
    const hallado = texto.match(patron)
    const normalizado = normalizarCuv(hallado?.[1] ?? '')
    if (normalizado) return normalizado
  }

  const compacto = texto.replace(/\s+/g, '')
  if (esCuvOficial(compacto)) return compacto.toLowerCase()

  const suelto = texto.match(/[0-9a-fA-F]{96}/)
  return suelto ? suelto[0].toLowerCase() : null
}

export function interpretarResultadosMSPS(contenido, nombreArchivo = '') {
  const texto = String(contenido ?? '')
  const cuv = extraerCuvDeTexto(texto)
  const aprobadoPorNombre = archivoIndicaAprobacion(nombreArchivo)
  const mencionaRechazo = /\bRECHAZADO\b/i.test(texto)
  const mencionaAprobado = /\bAPROBADO\b/i.test(texto)

  if (cuv && (aprobadoPorNombre || mencionaAprobado || !mencionaRechazo)) {
    return {
      aprobado: true,
      cuv,
      mensaje: 'Validado y CUV asignado exitosamente.',
    }
  }

  if (mencionaRechazo || (!cuv && !aprobadoPorNombre && !mencionaAprobado)) {
    return {
      aprobado: false,
      cuv: null,
      mensaje: mencionaRechazo
        ? 'Rechazado en validación central del Ministerio.'
        : 'No se encontró un Código Único de Validación de 96 caracteres.',
      rechazado: mencionaRechazo,
    }
  }

  return {
    aprobado: false,
    cuv: null,
    mensaje: 'El archivo de aprobación no trae un CUV de 96 caracteres.',
    rechazado: false,
  }
}
