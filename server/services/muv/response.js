const CUV_PATTERN = /^[0-9a-fA-F]{64,128}$/

/**
 * @param {unknown} value
 * @returns {'RECHAZADO' | 'NOTIFICACION' | string}
 */
export function normalizeClase(value) {
  const text = String(value ?? '').trim().toUpperCase()
  if (text.startsWith('RECHAZ')) return 'RECHAZADO'
  if (text.startsWith('NOTIF')) return 'NOTIFICACION'
  return text
}

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
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!CUV_PATTERN.test(trimmed)) return null
  return trimmed.toLowerCase()
}

/**
 * @param {unknown} data
 * @returns {Array<{ clase: string, codigo: string, descripcion: string, observaciones: string, pathFuente: string, fuente: string }>}
 */
export function readResultadosValidacion(data) {
  const source = data && typeof data === 'object' ? data : {}
  const list = source.ResultadosValidacion ?? source.resultadosValidacion ?? source.Errores ?? source.errores ?? []
  if (!Array.isArray(list)) return []

  return list.map((item) => ({
    clase: normalizeClase(item?.Clase ?? item?.clase ?? item?.Tipo ?? item?.tipo),
    codigo: String(item?.Codigo ?? item?.codigo ?? item?.code ?? '').trim(),
    descripcion: String(item?.Descripcion ?? item?.descripcion ?? item?.message ?? 'Resultado de validación del MUV').trim(),
    observaciones: String(item?.Observaciones ?? item?.observaciones ?? '').trim(),
    pathFuente: String(item?.PathFuente ?? item?.pathFuente ?? item?.Campo ?? item?.campo ?? item?.field ?? '').trim(),
    fuente: String(item?.Fuente ?? item?.fuente ?? '').trim(),
  }))
}

/**
 * @param {{ clase: string, codigo: string, descripcion: string, observaciones: string, pathFuente: string, fuente: string }} item
 */
export function toMinistryError(item) {
  return {
    code: item.codigo,
    clase: item.clase,
    field: item.pathFuente,
    message: item.descripcion,
    observaciones: item.observaciones,
    fuente: item.fuente,
  }
}

/**
 * Interpreta la respuesta de CargarFevRips (numeral 8.13 del manual).
 * ResultState true con notificaciones sigue entregando el CUV.
 * Un rechazo, o un CUV ausente, no se trata como éxito.
 *
 * @param {unknown} data
 * @param {number} httpStatus
 */
export function parseMuvResponse(data, httpStatus) {
  const payload = data && typeof data === 'object' ? data : {}
  const resultados = readResultadosValidacion(payload)
  const rechazos = resultados.filter((item) => item.clase === 'RECHAZADO')
  const notificaciones = resultados.filter((item) => item.clase !== 'RECHAZADO')
  const cuv = extractCuv(payload)
  const resultState = payload.ResultState === true || payload.resultState === true
  const approved = httpStatus >= 200 && httpStatus < 300 && resultState && Boolean(cuv) && rechazos.length === 0

  if (!approved && rechazos.length === 0 && httpStatus >= 400) {
    rechazos.push({
      clase: 'RECHAZADO',
      codigo: `HTTP_${httpStatus}`,
      descripcion: typeof payload.message === 'string' && payload.message
        ? payload.message
        : `El MUV respondió HTTP ${httpStatus}.`,
      observaciones: '',
      pathFuente: '',
      fuente: 'MUV',
    })
  }

  if (!approved && rechazos.length === 0 && !resultState && httpStatus < 400) {
    rechazos.push({
      clase: 'RECHAZADO',
      codigo: cuv ? 'RESULT_STATE' : 'CUV_AUSENTE',
      descripcion: cuv
        ? 'El MUV no marcó ResultState en true.'
        : 'El MUV no entregó un Código Único de Validación.',
      observaciones: '',
      pathFuente: '',
      fuente: 'MUV',
    })
  }

  return {
    success: approved,
    approved,
    httpStatus,
    resultState,
    cuv: approved ? cuv : null,
    procesoId: payload.ProcesoId ?? payload.procesoId ?? null,
    numFactura: payload.NumFactura ?? payload.numFactura ?? null,
    fechaRadicacion: payload.FechaRadicacion ?? payload.fechaRadicacion ?? null,
    ambiente: payload.Ambiente ?? payload.ambiente ?? null,
    modulo: payload.Modulo ?? payload.modulo ?? null,
    modalidadPago: payload.ModalidadPago ?? payload.modalidadPago ?? null,
    periodoAtencion: payload.PeriodoAtencion ?? payload.periodoAtencion ?? null,
    notificaciones,
    rechazos,
    ministryErrors: rechazos.map(toMinistryError),
    errors: rechazos.map(toMinistryError),
  }
}
