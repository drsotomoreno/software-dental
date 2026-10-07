import { consultarEstadoCuv, listarExpedientes, registrarRadicacion } from './cuv/service.js'

/**
 * Persiste el CUV de una factura o atención, con el intento y la respuesta del ministerio.
 * @param {object} entry
 */
export async function saveCuvRecord(entry) {
  return registrarRadicacion(entry)
}

export async function getCuvByFactura(numFactura) {
  const result = await consultarEstadoCuv({ numFactura: String(numFactura) })
  if (!result.success || result.expediente.estado === 'rechazado') return null
  return result.expediente
}

export async function listCuvRecords({ limit = 50 } = {}) {
  return listarExpedientes({ limit })
}

export async function getCuvById(id) {
  const result = await consultarEstadoCuv({ id: String(id) })
  return result.success ? result.expediente : null
}
