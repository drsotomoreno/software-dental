import { gzipSync } from 'node:zlib'
import { config } from '../config.js'
import { resolveMuvAmbiente } from './muvAmbiente.js'

export const MUV_LOGIN_PATH = '/api/Auth/LoginSISPRO'
export const MUV_CARGAR_FEV_RIPS_PATH = '/api/PaquetesFevRips/CargarFevRips'

const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504])
const DEFAULT_TIMEOUT_MS = 60_000

/**
 * Error tipado del MUV. `details` no incluye clave, contraseña ni token.
 */
export class MuvApiError extends Error {
  /**
   * @param {object} params
   * @param {string} params.message
   * @param {import('../../src/types/muv.ts').MuvErrorCode} params.code
   * @param {string} params.endpoint
   * @param {number} [params.status]
   * @param {boolean} [params.retryable]
   * @param {import('../../src/types/muv.ts').MuvMinistryIssue[]} [params.details]
   * @param {unknown} [params.cause]
   */
  constructor({ message, code, endpoint, status = 0, retryable = false, details = [], cause }) {
    super(message, cause ? { cause } : undefined)
    this.name = 'MuvApiError'
    this.code = code
    this.endpoint = endpoint
    this.status = status
    this.retryable = retryable
    this.details = details
    this.glosas = details
  }
}

/** CodigoUnicoValidacion del numeral 8.13: 96 caracteres hexadecimales. */
export const CUV_LONGITUD = 96
export const CUV_HEX_PATTERN = /^[0-9a-fA-F]{96}$/
/** El manual recomienda gzip a partir de 50 MB. */
export const GZIP_UMBRAL_BYTES = 50 * 1024 * 1024

export function extraerCuv(data) {
  const raw = data?.CodigoUnicoValidacion ?? data?.codigoUnicoValidacion ?? data?.CUV ?? data?.cuv ?? null
  if (typeof raw !== 'string') return null
  const compact = raw.replace(/\s+/g, '')
  return compact || null
}

export function esCodigoUnicoValidacion(value) {
  return CUV_HEX_PATTERN.test(String(value ?? '').replace(/\s+/g, ''))
}

/**
 * Una fila de ResultadosValidacion, lista para mostrarla al odontólogo.
 * @param {object} item
 */
export function formatearResultadoValidacion(item) {
  const claseRaw = String(item?.clase ?? item?.Clase ?? 'RECHAZADO').trim().toUpperCase()
  const clase = claseRaw === 'NOTIFICACION' ? 'NOTIFICACION' : 'RECHAZADO'
  const codigo = String(item?.codigo ?? item?.Codigo ?? item?.code ?? 'MUV').trim() || 'MUV'
  const descripcion = String(
    item?.descripcion ??
      item?.Descripcion ??
      item?.Observaciones ??
      item?.observaciones ??
      item?.message ??
      'El Ministerio reportó una validación sin descripción.',
  ).trim()
  const prefijo = clase === 'NOTIFICACION' ? 'Notificación' : 'Rechazo'
  return {
    clase,
    codigo,
    descripcion,
    observaciones: item?.observaciones ?? item?.Observaciones ?? null,
    pathFuente: item?.pathFuente ?? item?.PathFuente ?? item?.Campo ?? item?.field ?? null,
    fuente: item?.fuente ?? item?.Fuente ?? null,
    mensaje: `${prefijo} ${codigo}: ${descripcion}`,
  }
}

/**
 * Lee el response 8.13. El CUV solo es válido con ResultState true y 96 hexadecimales.
 * @param {object} data
 */
export function interpretarRespuestaCargarFevRips(data) {
  const resultState = data?.ResultState === true || data?.resultState === true
  const cuv = String(extraerCuv(data) ?? '')
  const informes = extraerGlosas(data).map(formatearResultadoValidacion)
  const notificaciones = informes.filter((item) => item.clase === 'NOTIFICACION')
  const rechazos = informes.filter((item) => item.clase === 'RECHAZADO')
  const cuvValido = resultState && esCodigoUnicoValidacion(cuv) && rechazos.length === 0
  const visibles = cuvValido ? notificaciones : rechazos.length ? rechazos : informes
  let mensaje = ''
  if (visibles.length) mensaje = visibles.map((item) => item.mensaje).join(' · ')
  else if (!cuvValido && !resultState) mensaje = 'El Ministerio rechazó el paquete FEV-RIPS.'
  else if (!cuvValido) mensaje = 'El Ministerio no entregó un CodigoUnicoValidacion de 96 caracteres.'

  return {
    success: cuvValido,
    resultState,
    cuv: cuvValido ? cuv : null,
    procesoId: data?.ProcesoId ?? data?.PorcesoID ?? data?.procesoId ?? null,
    numFactura: data?.NumFactura ?? data?.numFactura ?? null,
    fechaRadicacion: data?.FechaRadicacion ?? data?.fechaRadicacion ?? null,
    ambiente: data?.Ambiente ?? null,
    notificaciones,
    rechazos,
    informes,
    mensaje,
  }
}

export function extraerGlosas(payload) {
  if (!payload || typeof payload !== 'object') return []
  const candidates =
    payload.resultadosValidacion ??
    payload.ResultadosValidacion ??
    payload.Errores ??
    payload.errores ??
    payload.errors ??
    []
  if (!Array.isArray(candidates)) {
    if (typeof payload.message === 'string') {
      return [{ clase: 'RECHAZADO', codigo: 'MUV', descripcion: payload.message, pathFuente: null }]
    }
    return []
  }
  return candidates.map((item) => ({
    clase: item?.Clase ?? item?.clase ?? 'RECHAZADO',
    codigo: item?.Codigo ?? item?.codigo ?? item?.code ?? null,
    descripcion: item?.Descripcion ?? item?.descripcion ?? item?.Observaciones ?? item?.message ?? 'Glosa del MUV',
    observaciones: item?.Observaciones ?? item?.observaciones ?? null,
    pathFuente: item?.PathFuente ?? item?.pathFuente ?? item?.Campo ?? item?.field ?? null,
    fuente: item?.Fuente ?? item?.fuente ?? null,
  }))
}

function normalizeIssues(payload) {
  if (!payload || typeof payload !== 'object') return []
  const candidates =
    payload.Errores ?? payload.errores ?? payload.errors ?? payload.ResultadosValidacion ?? []
  if (!Array.isArray(candidates)) {
    if (typeof payload.message === 'string') return [{ message: payload.message }]
    return []
  }
  return candidates.map((item) => ({
    code: item?.Codigo ?? item?.codigo ?? item?.code,
    field: item?.Campo ?? item?.campo ?? item?.field ?? item?.Path,
    message: item?.Descripcion ?? item?.descripcion ?? item?.message ?? 'Error de validación del MUV',
    line: item?.Linea ?? item?.linea ?? item?.line,
  }))
}

function redact(value) {
  if (Array.isArray(value)) return value.map(redact)
  if (!value || typeof value !== 'object') return value
  const out = {}
  for (const [key, item] of Object.entries(value)) {
    if (/clave|password|token|authorization/i.test(key)) continue
    out[key] = redact(item)
  }
  return out
}

function joinUrl(baseUrl, path) {
  const base = String(baseUrl ?? '').replace(/\/$/, '')
  const suffix = path.startsWith('/') ? path : `/${path}`
  if (!base) {
    throw new MuvApiError({
      code: 'CONFIG',
      endpoint: suffix,
      status: 500,
      retryable: false,
      message: 'MINSALUD_API_BASE_URL es obligatorio para consumir el MUV.',
    })
  }
  return `${base}${suffix}`
}

/**
 * Cliente HTTP del MUV. El Bearer token se inyecta en cada carga
 * desde el argumento o desde `getToken`, nunca queda fijo en el cliente.
 *
 * @param {import('../../src/types/muv.ts').MuvClientOptions} [options]
 */
export function createMuvClient(options = {}) {
  const fetchImpl = options.fetch ?? globalThis.fetch
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const authPath = options.authPath ?? config.minsalud.authPath ?? MUV_LOGIN_PATH
  const cargarPath = options.cargarPath ?? config.minsalud.validatePath ?? MUV_CARGAR_FEV_RIPS_PATH

  function urlFor(path, override) {
    if (override) return override
    return joinUrl(options.baseUrl ?? resolveMuvAmbiente().apiBaseUrl, path)
  }

  async function resolveToken(explicit) {
    if (explicit) return explicit
    if (!options.getToken) return ''
    return (await options.getToken()) ?? ''
  }

  /**
   * @param {object} params
   * @param {string} params.endpoint
   * @param {string} params.url
   * @param {object} params.body
   * @param {Record<string, string>} [params.headers]
   */
  async function postJson({ endpoint, url, body, headers = {} }) {
    const json = JSON.stringify(body)
    const gzip = headers['Content-Encoding'] === 'gzip'
    let response
    try {
      response = await fetchImpl(url, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          ...headers,
        },
        body: gzip ? gzipSync(Buffer.from(json)) : json,
        signal: AbortSignal.timeout(timeoutMs),
      })
    } catch (error) {
      const timedOut = error?.name === 'TimeoutError' || error?.name === 'AbortError'
      throw new MuvApiError({
        code: 'RED',
        endpoint,
        status: timedOut ? 504 : 503,
        retryable: true,
        message: timedOut
          ? 'Tiempo de espera agotado al contactar el MUV.'
          : 'No se pudo contactar el MUV.',
        cause: error,
      })
    }

    const text = await response.text()
    let data = {}
    if (text) {
      try {
        data = JSON.parse(text)
      } catch {
        throw new MuvApiError({
          code: 'HTTP',
          endpoint,
          status: response.status,
          retryable: RETRYABLE_STATUS.has(response.status),
          message: 'El MUV respondió un cuerpo que no es JSON.',
          details: [{ message: text.slice(0, 300) }],
        })
      }
    }

    return { response, data }
  }

  /**
   * POST /api/Auth/LoginSISPRO
   * @param {import('../../src/types/muv.ts').MuvLoginRequest} credenciales
   * @returns {Promise<import('../../src/types/muv.ts').MuvLoginResult>}
   */
  async function loginSispro(credenciales) {
    const endpoint = authPath
    const url = options.authUrl || config.minsalud.authUrl || urlFor(endpoint)
    const { response, data } = await postJson({
      endpoint,
      url,
      body: {
        persona: {
          identificacion: {
            tipo: credenciales?.persona?.identificacion?.tipo,
            numero: credenciales?.persona?.identificacion?.numero,
          },
        },
        clave: credenciales?.clave,
        nit: credenciales?.nit,
        tipoUsuario: credenciales?.tipoUsuario || 'RE',
      },
    })

    if (!response.ok || data.login === false) {
      throw new MuvApiError({
        code: 'AUTH',
        endpoint,
        status: response.status || 401,
        retryable: RETRYABLE_STATUS.has(response.status),
        message: typeof data.message === 'string' ? data.message : 'Autenticación SISPRO fallida.',
        details: normalizeIssues(redact(data)),
      })
    }

    const token = data.token ?? data.Token
    if (!token) {
      throw new MuvApiError({
        code: 'AUTH',
        endpoint,
        status: response.status || 502,
        retryable: false,
        message: 'El MUV no devolvió el Bearer token.',
        details: normalizeIssues(redact(data)),
      })
    }

    return {
      token,
      login: true,
      expiresIn: data.expires_in ?? data.expiresIn,
    }
  }

  /**
   * POST /api/PaquetesFevRips/CargarFevRips
   * @param {object} paquete JSON RIPS Res. 2275
   * @param {{ token?: string }} [auth]
   * @returns {Promise<import('../../src/types/muv.ts').MuvCargarFevRipsResult>}
   */
  async function cargarFevRips(paquete, auth = {}) {
    const endpoint = cargarPath
    const token = await resolveToken(auth.token)
    if (!token) {
      throw new MuvApiError({
        code: 'AUTH',
        endpoint,
        status: 401,
        retryable: false,
        message: 'No hay Bearer token para cargar el paquete RIPS en el MUV.',
      })
    }

    const body =
      paquete && typeof paquete === 'object' && paquete.rips && 'xmlFevFile' in paquete
        ? { rips: paquete.rips, xmlFevFile: paquete.xmlFevFile }
        : { rips: paquete, xmlFevFile: '' }

    const headers = { Authorization: `Bearer ${token}` }
    if (auth.gzip) headers['Content-Encoding'] = 'gzip'

    const { response, data } = await postJson({
      endpoint,
      url: urlFor(endpoint),
      body,
      headers,
    })

    if (!response.ok) {
      const validation = response.status === 400 || response.status === 422
      const lectura = interpretarRespuestaCargarFevRips(data)
      throw new MuvApiError({
        code: validation ? 'VALIDACION' : 'HTTP',
        endpoint,
        status: response.status,
        retryable: RETRYABLE_STATUS.has(response.status),
        message: lectura.informes.length
          ? lectura.mensaje
          : validation
            ? 'El MUV rechazó el paquete RIPS por validación.'
            : `El MUV respondió HTTP ${response.status}.`,
        details: lectura.informes.length ? lectura.informes : extraerGlosas(redact(data)),
      })
    }

    const lectura = interpretarRespuestaCargarFevRips(data)
    if (!lectura.success) {
      throw new MuvApiError({
        code: lectura.rechazos.length ? 'RECHAZO' : 'VALIDACION',
        endpoint,
        status: 422,
        retryable: false,
        message: lectura.mensaje,
        details: lectura.rechazos.length ? lectura.rechazos : lectura.informes,
      })
    }

    return {
      cuv: lectura.cuv,
      procesoId: lectura.procesoId,
      fechaRadicacion: lectura.fechaRadicacion,
      estado: 'APROBADO',
      notificaciones: lectura.notificaciones,
      raw: data,
    }
  }

  return {
    loginSispro,
    cargarFevRips,
  }
}

/** Cliente configurado con la base URL del Ministerio. */
export const muvClient = createMuvClient()
