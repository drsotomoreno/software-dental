import { config } from '../../config.js'
import { clearMinsaludTokenCache, getMinsaludAccessToken } from '../minsaludAuth.js'
import { createMuvAuditLogger } from './auditLog.js'
import { buildCargarFevRipsBody, encodeCargarFevRipsRequest } from './request.js'
import { parseMuvResponse } from './response.js'

const CARGAR_FEV_RIPS_PATH = '/api/PaquetesFevRips/CargarFevRips'

/**
 * @param {object} [options]
 * @param {() => Promise<string | null>} [options.getAccessToken]
 * @param {() => void} [options.clearAccessToken]
 * @param {typeof fetch} [options.fetchImpl]
 * @param {ReturnType<typeof createMuvAuditLogger>} [options.logger]
 * @param {string} [options.baseUrl]
 * @param {string} [options.path]
 * @param {boolean} [options.gzip]
 * @param {number} [options.timeoutMs]
 */
export function createMuvClient(options = {}) {
  const getAccessToken = options.getAccessToken ?? getMinsaludAccessToken
  const clearAccessToken = options.clearAccessToken ?? clearMinsaludTokenCache
  const fetchImpl = options.fetchImpl ?? globalThis.fetch
  const logger = options.logger ?? createMuvAuditLogger()
  const timeoutMs = options.timeoutMs ?? 60_000

  /**
   * @param {object} params
   * @param {object} params.rips
   * @param {string} [params.xmlFev]
   * @param {string} [params.xmlFevFile]
   * @param {object} [params.metadatos]
   */
  async function cargarFevRips(params) {
    const requestId = params.metadatos?.requestId ?? `muv-${Date.now()}`
    const body = buildCargarFevRipsBody(params)
    const baseUrl = (options.baseUrl ?? config.minsalud.apiBaseUrl ?? '').replace(/\/$/, '')
    const path = options.path ?? config.minsalud.validatePath ?? CARGAR_FEV_RIPS_PATH
    const url = `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`
    const summary = packageSummary(body.rips)

    if (!body.xmlFevFile) {
      const rechazos = [{
        clase: 'RECHAZADO',
        codigo: 'FEV_XML_REQUERIDO',
        descripcion: 'CargarFevRips exige el AttachedDocument de la FEV en xmlFevFile (Base64).',
        observaciones: 'Adjunte el XML validado por la DIAN antes de enviarlo al MUV.',
        pathFuente: 'xmlFevFile',
        fuente: 'FacturaElectronica',
      }]
      logger.record({
        event: 'muv.rejected_local',
        requestId,
        endpoint: 'CargarFevRips',
        ...summary,
        codigo: 'FEV_XML_REQUERIDO',
      })
      return failed(rechazos, { httpStatus: 0, requestId })
    }

    if (!baseUrl) {
      const rechazos = [{
        clase: 'RECHAZADO',
        codigo: 'MUV_URL',
        descripcion: 'Falta MINSALUD_API_BASE_URL del API Docker FEV-RIPS.',
        observaciones: '',
        pathFuente: '',
        fuente: 'MUV',
      }]
      logger.record({ event: 'muv.rejected_local', requestId, codigo: 'MUV_URL' })
      return failed(rechazos, { httpStatus: 0, requestId })
    }

    let token
    try {
      token = await getAccessToken()
    } catch (error) {
      logger.record({
        event: 'muv.auth_error',
        requestId,
        message: error instanceof Error ? error.message : 'No se obtuvo el token',
      })
      return failed([{
        clase: 'RECHAZADO',
        codigo: 'AUTH',
        descripcion: 'No se pudo obtener el Bearer Token del MUV.',
        observaciones: error instanceof Error ? error.message : '',
        pathFuente: '',
        fuente: 'MUV',
      }], { httpStatus: 0, requestId })
    }

    if (!token) {
      logger.record({ event: 'muv.auth_error', requestId, codigo: 'AUTH' })
      return failed([{
        clase: 'RECHAZADO',
        codigo: 'AUTH',
        descripcion: 'No hay token vigente para el MUV. Revise las credenciales de la Fase 1.',
        observaciones: '',
        pathFuente: '',
        fuente: 'MUV',
      }], { httpStatus: 0, requestId })
    }

    const gzip = options.gzip ?? config.minsalud.gzip !== false
    let outcome = await postPackage({ fetchImpl, logger, url, token, body, gzip, timeoutMs, requestId, summary })
    if (outcome.httpStatus === 401) {
      clearAccessToken()
      try {
        token = await getAccessToken()
      } catch {
        token = null
      }
      if (token) {
        logger.record({ event: 'muv.retry_unauthorized', requestId })
        outcome = await postPackage({ fetchImpl, logger, url, token, body, gzip, timeoutMs, requestId, summary })
      }
    }

    return { ...outcome.parsed, requestId }
  }

  return { cargarFevRips }
}

/**
 * @param {Array<{ clase: string, codigo: string, descripcion: string, observaciones: string, pathFuente: string, fuente: string }>} rechazos
 * @param {{ httpStatus: number, requestId: string }} meta
 */
function failed(rechazos, meta) {
  return {
    success: false,
    approved: false,
    httpStatus: meta.httpStatus,
    resultState: false,
    cuv: null,
    procesoId: null,
    numFactura: null,
    fechaRadicacion: null,
    ambiente: null,
    modulo: null,
    modalidadPago: null,
    periodoAtencion: null,
    notificaciones: [],
    rechazos,
    ministryErrors: rechazos.map((item) => ({
      code: item.codigo,
      clase: item.clase,
      field: item.pathFuente,
      message: item.descripcion,
      observaciones: item.observaciones,
      fuente: item.fuente,
    })),
    errors: rechazos.map((item) => ({
      code: item.codigo,
      clase: item.clase,
      field: item.pathFuente,
      message: item.descripcion,
      observaciones: item.observaciones,
      fuente: item.fuente,
    })),
    requestId: meta.requestId,
  }
}

/**
 * @param {object} rips
 */
function packageSummary(rips) {
  const usuarios = Array.isArray(rips?.usuarios) ? rips.usuarios : []
  let consultas = 0
  let procedimientos = 0
  let otrosServicios = 0
  for (const usuario of usuarios) {
    consultas += usuario?.servicios?.consultas?.length ?? 0
    procedimientos += usuario?.servicios?.procedimientos?.length ?? 0
    otrosServicios += usuario?.servicios?.otrosServicios?.length ?? 0
  }
  return {
    numFactura: rips?.numFactura ?? null,
    nit: rips?.numDocumentoIdObligado ?? null,
    usuarios: usuarios.length,
    consultas,
    procedimientos,
    otrosServicios,
  }
}

/**
 * @param {object} params
 */
async function postPackage(params) {
  const encoded = encodeCargarFevRipsRequest(params.body, { gzip: params.gzip })
  const started = Date.now()
  params.logger.record({
    event: 'muv.request',
    requestId: params.requestId,
    endpoint: 'CargarFevRips',
    method: 'POST',
    url: params.url,
    compressed: encoded.compressed,
    jsonBytes: encoded.jsonBytes,
    bodyBytes: encoded.body.length,
    ...params.summary,
  })

  let response
  try {
    response = await params.fetchImpl(params.url, {
      method: 'POST',
      headers: {
        ...encoded.headers,
        Authorization: `Bearer ${params.token}`,
      },
      body: encoded.body,
      signal: AbortSignal.timeout(params.timeoutMs),
    })
  } catch (error) {
    params.logger.record({
      event: 'muv.network_error',
      requestId: params.requestId,
      durationMs: Date.now() - started,
      message: error instanceof Error ? error.message : 'Error de red',
    })
    const rechazos = [{
      clase: 'RECHAZADO',
      codigo: 'RED',
      descripcion: 'No hubo respuesta del MUV.',
      observaciones: error instanceof Error ? error.message : '',
      pathFuente: '',
      fuente: 'MUV',
    }]
    return { httpStatus: 0, parsed: failed(rechazos, { httpStatus: 0, requestId: params.requestId }) }
  }

  const text = await response.text()
  let data = {}
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = { message: text.slice(0, 500) }
    }
  }

  const parsed = parseMuvResponse(data, response.status)
  params.logger.record({
    event: 'muv.response',
    requestId: params.requestId,
    durationMs: Date.now() - started,
    httpStatus: response.status,
    resultState: parsed.resultState,
    approved: parsed.approved,
    cuv: parsed.cuv,
    procesoId: parsed.procesoId,
    ambiente: parsed.ambiente,
    modulo: parsed.modulo,
    notificaciones: parsed.notificaciones.map((item) => item.codigo),
    rechazos: parsed.rechazos.map((item) => ({
      codigo: item.codigo,
      pathFuente: item.pathFuente,
      descripcion: item.descripcion,
    })),
  })

  return { httpStatus: response.status, parsed }
}

const defaultClient = createMuvClient()

/**
 * Envía el paquete FEV-RIPS al endpoint CargarFevRips.
 * El Bearer es el token de `getMinsaludAccessToken` (Fase 1).
 *
 * @param {object} params
 */
export function cargarFevRips(params) {
  return defaultClient.cargarFevRips(params)
}
