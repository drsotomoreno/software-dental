const CUV_PATTERN = /^[0-9a-fA-F]{64,128}$/

/**
 * @param {unknown} data
 * @returns {string | null}
 */
export function extractCuv(data) {
  if (!data || typeof data !== 'object') return null
  const value = data.CodigoUnicoValidacion
    ?? data.codigoUnicoValidacion
    ?? data.CUV
    ?? data.cuv
  if (typeof value !== 'string' || !CUV_PATTERN.test(value.trim())) return null
  return value.trim().toLowerCase()
}

/**
 * @param {unknown} data
 */
export function readResultados(data) {
  const source = data && typeof data === 'object' ? data : {}
  const list = source.ResultadosValidacion ?? source.resultadosValidacion ?? []
  if (!Array.isArray(list)) return []
  return list.map((item) => {
    const claseRaw = String(item?.Clase ?? item?.clase ?? '').trim().toUpperCase()
    const clase = claseRaw.startsWith('RECHAZ') ? 'RECHAZADO' : 'NOTIFICACION'
    return {
      clase,
      codigo: String(item?.Codigo ?? item?.codigo ?? '').trim(),
      descripcion: String(item?.Descripcion ?? item?.descripcion ?? '').trim(),
      observaciones: String(item?.Observaciones ?? item?.observaciones ?? '').trim(),
      pathFuente: String(item?.PathFuente ?? item?.pathFuente ?? '').trim(),
      fuente: String(item?.Fuente ?? item?.fuente ?? 'FacturaElectronica').trim(),
    }
  })
}

/**
 * @param {unknown} data
 * @param {number} httpStatus
 */
export function parseFevcdResponse(data, httpStatus) {
  const payload = data && typeof data === 'object' ? data : {}
  const resultados = readResultados(payload)
  const rechazos = resultados.filter((item) => item.clase === 'RECHAZADO')
  const notificaciones = resultados.filter((item) => item.clase !== 'RECHAZADO')
  const cuv = extractCuv(payload)
  const guid = payload.guid ?? payload.Guid ?? payload.GUID ?? null
  const sha256 = payload.sha256 ?? payload.Sha256 ?? payload.SHA256 ?? null

  if (httpStatus === 409) {
    return {
      success: true,
      duplicado: true,
      httpStatus,
      cuv,
      guid,
      sha256,
      notificaciones,
      rechazos,
    }
  }

  const accepted = httpStatus >= 200 && httpStatus < 300 && rechazos.length === 0
  return {
    success: accepted,
    duplicado: false,
    httpStatus,
    cuv: accepted ? cuv : null,
    guid,
    sha256,
    notificaciones,
    rechazos,
  }
}

export const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504])
