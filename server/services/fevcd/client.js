import { createMuvAuditLogger } from '../muv/auditLog.js'
import { getMinsaludAccessToken } from '../minsaludAuth.js'
import { encodeMultipart, identifyXml, splitBytes } from './multipart.js'
import { parseFevcdResponse, RETRYABLE_STATUS } from './response.js'
import { resolveFevcdSettings } from './settings.js'

/**
 * Cliente del módulo Receptor y Consultas de FEVCD.
 * Reintenta solo fallos propios de un ambiente preliminar inestable.
 * Un 409 se trata como el mismo cargue, sin un segundo envío.
 *
 * @param {object} [options]
 */
export function createFevcdClient(options = {}) {
  const settings = options.settings ?? resolveFevcdSettings()
  const fetchImpl = options.fetchImpl ?? globalThis.fetch
  const getAccessToken = options.getAccessToken ?? getMinsaludAccessToken
  const sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)))
  const logger = options.logger ?? createMuvAuditLogger({
    write: (line) => console.info(`[fevcd] ${line}`),
  })
  const random = options.random ?? Math.random

  async function cargar(document) {
    const identity = identifyXml(document.xml, document.guid)
    const parts = splitBytes(identity.bytes, settings.fragmentBytes)
    let last = null

    for (let index = 0; index < parts.length; index += 1) {
      const part = parts[index]
      const fields = {
        guid: identity.guid,
        tipoDocumento: document.tipoDocumento,
        tecnologia: document.tecnologia,
        sha256: identity.sha256,
        cucon: document.cucon,
        rolEmisor: document.rolEmisor,
        webhook: document.webhook,
        fragmentoIndice: parts.length > 1 ? index + 1 : null,
        fragmentoTotal: parts.length > 1 ? parts.length : null,
        detalleTecnologia: settings.enviarDetalle
          ? JSON.stringify({ tecnologia: document.tecnologia, lineas: document.lineas })
          : null,
      }
      const encoded = encodeMultipart(fields, {
        filename: `${identity.guid}-${index + 1}.xml`,
        bytes: Buffer.from(part),
      })
      last = await postWithRetry({
        path: settings.receptorPath,
        encoded,
        requestId: identity.guid,
        summary: {
          guid: identity.guid,
          sha256: identity.sha256,
          tecnologia: document.tecnologia,
          tipoDocumento: document.tipoDocumento,
          fragmento: parts.length > 1 ? `${index + 1}/${parts.length}` : '1/1',
        },
      })
      if (!last.success) return { ...last, guid: identity.guid, sha256: identity.sha256 }
    }

    return { ...last, guid: identity.guid, sha256: identity.sha256, sinRips: true }
  }

  /**
   * Consulta por CUV, SHA-256, GUID o rango de fechas (módulo Consultas).
   * @param {{ cuv?: string, sha256?: string, guid?: string, desde?: string, hasta?: string }} consulta
   */
  async function consultar(consulta) {
    const token = await readToken(consulta.guid ?? 'consulta')
    if (!token) return tokenFailure(consulta.guid ?? 'consulta')
    const url = `${settings.apiBaseUrl}${settings.consultaPath}`
    logger.record({ event: 'fevcd.consulta', ...consulta, url })
    let response
    try {
      response = await fetchImpl(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(consulta),
        signal: AbortSignal.timeout(settings.timeoutMs),
      })
    } catch (error) {
      logger.record({
        event: 'fevcd.consulta_error',
        message: error instanceof Error ? error.message : 'sin respuesta',
      })
      return { success: false, incierto: true, httpStatus: 0, cuv: null, rechazos: [], notificaciones: [] }
    }
    const data = await readJson(response)
    const parsed = parseFevcdResponse(data, response.status)
    logger.record({
      event: 'fevcd.consulta_respuesta',
      httpStatus: response.status,
      cuv: parsed.cuv,
      duplicado: parsed.duplicado,
    })
    return parsed
  }

  async function postWithRetry({ path, encoded, requestId, summary }) {
    let attempt = 0
    let lastParsed = null
    while (attempt < settings.maxAttempts) {
      attempt += 1
      const token = await readToken(requestId)
      if (!token) return tokenFailure(requestId)
      const url = `${settings.apiBaseUrl}${path}`
      logger.record({
        event: 'fevcd.request',
        requestId,
        attempt,
        url,
        bytes: encoded.body.length,
        ...summary,
      })
      try {
        const response = await fetchImpl(url, {
          method: 'POST',
          headers: {
            'Content-Type': encoded.contentType,
            Accept: 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: encoded.body,
          signal: AbortSignal.timeout(settings.timeoutMs),
        })
        const data = await readJson(response)
        lastParsed = { ...parseFevcdResponse(data, response.status), intentos: attempt, incierto: false }
        logger.record({
          event: 'fevcd.response',
          requestId,
          attempt,
          httpStatus: response.status,
          success: lastParsed.success,
          duplicado: lastParsed.duplicado,
          cuv: lastParsed.cuv,
          rechazos: lastParsed.rechazos.map((item) => item.codigo),
        })
        if (lastParsed.success || !RETRYABLE_STATUS.has(response.status)) return lastParsed
      } catch (error) {
        logger.record({
          event: 'fevcd.intermitencia',
          requestId,
          attempt,
          message: error instanceof Error ? error.message : 'error de red',
        })
        lastParsed = {
          success: false,
          incierto: true,
          httpStatus: 0,
          cuv: null,
          duplicado: false,
          notificaciones: [],
          rechazos: [],
          intentos: attempt,
        }
      }
      if (attempt < settings.maxAttempts) {
        const delay = settings.retryBaseMs * (2 ** (attempt - 1)) + Math.floor(random() * 100)
        await sleep(delay)
      }
    }

    const recovered = await consultar({ guid: summary.guid, sha256: summary.sha256 })
    if (recovered?.cuv || recovered?.duplicado) {
      logger.record({ event: 'fevcd.recuperado', requestId, cuv: recovered.cuv })
      return { ...recovered, recuperado: true, incierto: false, intentos: attempt }
    }
    return { ...lastParsed, incierto: true, intentos: attempt }
  }

  async function readToken(requestId) {
    try {
      return await getAccessToken()
    } catch (error) {
      logger.record({
        event: 'fevcd.auth_error',
        requestId,
        message: error instanceof Error ? error.message : 'sin token',
      })
      return null
    }
  }

  return { cargar, consultar }
}

/**
 * @param {string} requestId
 */
function tokenFailure(requestId) {
  return {
    success: false,
    httpStatus: 0,
    cuv: null,
    duplicado: false,
    incierto: false,
    notificaciones: [],
    rechazos: [{
      clase: 'RECHAZADO',
      codigo: 'AUTH',
      descripcion: 'No hay token para el módulo de compra directa.',
      observaciones: '',
      pathFuente: '',
      fuente: 'FEVCD',
    }],
    intentos: 0,
    requestId,
  }
}

/**
 * @param {{ text: () => Promise<string> }} response
 */
async function readJson(response) {
  const text = await response.text()
  if (!text) return {}
  try {
    return JSON.parse(text)
  } catch {
    return { message: text.slice(0, 300) }
  }
}
