/**
 * Cliente de radicación RIPS contra el MUV/SISPRO.
 * Vive en el servidor para que el bearer y la clave del prestador no entren al bundle de Vite.
 * Con CUFE o XML usa CargarFevRips; sin ellos, CargarRipsSinFactura.
 * El login reutiliza el contrato LoginSISPRO de resolveMinsaludSettings.
 */

import dns from 'node:dns'
import http from 'node:http'
import https from 'node:https'
import net from 'node:net'
import { resolveMinsaludSettings } from './minsaludService.js'

const CARGAR_FEV_PATH = '/api/PaquetesFevRips/CargarFevRips'
const DEFAULT_TIMEOUT_MS = 45_000
const MIN_TIMEOUT_MS = 1_000
const MAX_TIMEOUT_MS = 180_000
const DEFAULT_REINTENTOS = 3
const MAX_REINTENTOS = 5
const BACKOFF_BASE_MS = 200
const BACKOFF_TOPE_MS = 2_000
const TOKEN_RENEW_SKEW_MS = 5 * 60 * 1000
const DEFAULT_TOKEN_TTL_MS = 50 * 60 * 1000

const CAMPOS_AJENOS_AL_RIPS = new Set([
  'cufe',
  'CUFE',
  'cuv',
  'CUV',
  'evolutionId',
  'patientId',
  'xmlFevFile',
  'batchId',
  'authorization',
  'Authorization',
  'clave',
  'password',
  'token',
])

function envValue(name, source = process.env) {
  const value = source[name]
  return typeof value === 'string' ? value.trim() : ''
}

function joinUrl(base, path) {
  const root = String(base ?? '').replace(/\/$/, '')
  const suffix = path.startsWith('/') ? path : `/${path}`
  return `${root}${suffix}`
}

/**
 * Tiempo máximo de cada llamada al ministerio.
 * MINSALUD_TIMEOUT_MS se recorta al rango 1000–180000. Sin valor, 45 s.
 * @param {NodeJS.ProcessEnv} [source]
 */
export function resolveSisproTimeoutMs(source = process.env) {
  const raw = Number(envValue('MINSALUD_TIMEOUT_MS', source))
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_TIMEOUT_MS
  return Math.min(MAX_TIMEOUT_MS, Math.max(MIN_TIMEOUT_MS, Math.round(raw)))
}

/**
 * Reintentos extra después del primer intento. MINSALUD_REINTENTOS=0 los apaga.
 * @param {NodeJS.ProcessEnv} [source]
 */
export function resolveReintentosDeRed(source = process.env) {
  const raw = envValue('MINSALUD_REINTENTOS', source)
  if (!raw) return DEFAULT_REINTENTOS
  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed < 0) return DEFAULT_REINTENTOS
  return Math.min(MAX_REINTENTOS, Math.floor(parsed))
}

/**
 * Fallo de red, tiempo de espera o rechazo de plataforma. Se puede reintentar.
 * Un rechazo de validación del JSON no usa esta clase.
 */
export class MuvInfrastructureError extends Error {
  /**
   * @param {string} message
   * @param {{ code?: string, status?: number, httpStatus?: number | null, cause?: unknown, errors?: unknown[] }} [options]
   */
  constructor(message, options = {}) {
    super(message)
    this.name = 'MuvInfrastructureError'
    this.code = options.code || 'MUV_INFRASTRUCTURE'
    this.status = options.status ?? 503
    this.httpStatus = options.httpStatus ?? null
    this.retryable = true
    this.errors = Array.isArray(options.errors) ? options.errors : []
    if (options.cause !== undefined) this.cause = options.cause
  }
}

export function leerCufe(envelope = {}) {
  const directo = envelope?.cufe ?? envelope?.CUFE ?? envelope?.rips?.cufe ?? envelope?.rips?.CUFE
  return String(directo ?? '').trim()
}

export function leerXmlFev(envelope = {}) {
  const directo = envelope?.xmlFevFile ?? envelope?.rips?.xmlFevFile
  return typeof directo === 'string' ? directo : ''
}

/** fev si hay CUFE o XML; sin_factura en el resto de los paquetes. */
export function canalDeEnvio(envelope = {}) {
  return leerCufe(envelope) || leerXmlFev(envelope).trim() ? 'fev' : 'sin_factura'
}

/** Quita campos de transporte para que SISPRO reciba solo el JSON RIPS. */
export function ripsParaMinisterio(rips) {
  if (!rips || typeof rips !== 'object' || Array.isArray(rips)) return {}
  const copia = { ...rips }
  for (const campo of CAMPOS_AJENOS_AL_RIPS) delete copia[campo]
  return copia
}

/** La API espera el XML en base64. Un XML crudo que empieza por "<" se codifica. */
export function codificarXmlFev(xml) {
  const texto = typeof xml === 'string' ? xml.trim() : ''
  if (!texto) return ''
  if (texto.startsWith('<')) return Buffer.from(texto, 'utf8').toString('base64')
  return texto
}

function claseDe(item) {
  return String(item?.Clase ?? item?.clase ?? '').trim().toUpperCase()
}

function errorDeItem(item) {
  const message = String(
    item?.Descripcion ?? item?.descripcion ?? item?.Observaciones ?? item?.observaciones ?? item?.message ?? '',
  ).trim()
  return {
    code: String(item?.Codigo ?? item?.codigo ?? item?.code ?? 'MUV_VALIDACION'),
    message: message || 'El MUV rechazó el campo.',
    path: String(item?.PathFuente ?? item?.pathFuente ?? item?.path ?? ''),
    clase: claseDe(item) || 'ERROR',
  }
}

function erroresModelo(data) {
  const raw = data?.errors ?? data?.Errors ?? data?.errores
  if (Array.isArray(raw)) {
    return raw.map((item) => {
      if (item && typeof item === 'object') return errorDeItem(item)
      return { code: 'MUV_VALIDACION', message: String(item), path: '', clase: 'ERROR' }
    })
  }
  if (raw && typeof raw === 'object') {
    return Object.entries(raw).flatMap(([field, messages]) => {
      const list = Array.isArray(messages) ? messages : [messages]
      return list.map((message) => ({
        code: 'MUV_VALIDACION',
        message: String(message),
        path: field,
        clase: 'ERROR',
      }))
    })
  }
  return []
}

function erroresValidacion(data) {
  const items = data?.ResultadosValidacion ?? data?.resultadosValidacion
  if (Array.isArray(items) && items.length > 0) {
    const rechazos = items.filter((item) => claseDe(item) !== 'NOTIFICACION').map(errorDeItem)
    if (rechazos.length > 0) return rechazos
  }
  const modelo = erroresModelo(data)
  if (modelo.length > 0) return modelo
  const message = String(
    data?.message ?? data?.Message ?? data?.Detail ?? data?.detail ?? 'El MUV rechazó el RIPS.',
  ).trim()
  return [{ code: 'MUV_RECHAZO', message: message || 'El MUV rechazó el RIPS.', path: '', clase: 'RECHAZADO' }]
}

function cuvUtil(data) {
  const crudo = data?.CodigoUnicoValidacion ?? data?.codigoUnicoValidacion ?? data?.CUV ?? data?.cuv
  const cuv = String(crudo ?? '').replace(/\s/g, '').trim()
  if (!cuv || cuv === '-') return ''
  return cuv
}

/**
 * 200/201 con CUV y ResultState distinto de false es éxito.
 * 400/409/422, o 200/201 sin CUV, es validación estructural.
 * 401/403, 408, 429, 5xx y el resto se reintentan.
 * @param {number | undefined} status
 * @param {object | null} data
 */
export function interpretarRespuestaSispro(status, data) {
  const httpStatus = Number(status) || 0
  const cuerpo = data && typeof data === 'object' ? data : {}
  const resultStateFalso = cuerpo.ResultState === false || cuerpo.resultState === false
  const cuv = cuvUtil(cuerpo)
  const respondio = httpStatus === 200 || httpStatus === 201

  if (respondio && cuv && !resultStateFalso) {
    return { success: true, cuv, httpStatus, response: cuerpo, errors: [] }
  }

  const validacion =
    httpStatus === 400 ||
    httpStatus === 409 ||
    httpStatus === 422 ||
    (respondio && (resultStateFalso || !cuv))

  if (validacion) {
    return { success: false, cuv: null, httpStatus, response: cuerpo, errors: erroresValidacion(cuerpo) }
  }

  const code =
    httpStatus === 408 ? 'MUV_TIMEOUT' : httpStatus === 401 || httpStatus === 403 ? 'MUV_AUTH' : 'MUV_INFRASTRUCTURE'
  const mensaje =
    code === 'MUV_TIMEOUT'
      ? 'Tiempo de espera agotado al contactar el MUV.'
      : code === 'MUV_AUTH'
        ? 'El MUV rechazó la sesión del prestador.'
        : `El MUV no pudo radicar el RIPS (HTTP ${httpStatus || 'sin respuesta'}).`
  const failure = new MuvInfrastructureError(mensaje, {
    code,
    status: code === 'MUV_TIMEOUT' ? 504 : 503,
    httpStatus: httpStatus || null,
    errors: erroresModelo(cuerpo),
  })
  failure.response = cuerpo
  throw failure
}

function extractToken(data) {
  if (!data || typeof data !== 'object') return ''
  return String(data.token ?? data.Token ?? data.access_token ?? data.JWTToken ?? '').trim()
}

function jwtExpiryMs(token) {
  const parts = String(token ?? '').split('.')
  if (parts.length < 2) return null
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null
  } catch {
    return null
  }
}

function loginErrors(data) {
  if (!data || typeof data !== 'object') return []
  const modelo = erroresModelo(data).map((item) => item.message).filter(Boolean)
  if (modelo.length > 0) return modelo
  const texto = [data.mensaje, data.Mensaje, data.message, data.Message, data.Detail, data.detail].find(
    (item) => typeof item === 'string' && item.trim(),
  )
  return texto ? [String(texto).trim()] : []
}

const CODIGOS_TLS = new Set([
  'CERT_HAS_EXPIRED',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'ERR_TLS_CERT_ALTNAME_INVALID',
  'EPROTO',
])

const CODIGOS_RED = new Set([
  'ENOTFOUND',
  'EAI_AGAIN',
  'ECONNREFUSED',
  'ECONNRESET',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'EADDRNOTAVAIL',
  'UND_ERR_SOCKET',
])

function causaConCodigo(error) {
  let actual = error
  const vistos = new Set()
  while (actual && typeof actual === 'object' && !vistos.has(actual)) {
    vistos.add(actual)
    if (actual.code) return actual
    actual = actual.cause
  }
  return error
}

/** El envoltorio MUV_NETWORK oculta el Error de Node. Esta función baja por `cause` hasta el original. */
function errorNativoDeTransporte(error) {
  let actual = error
  const vistos = new Set()
  let nativo = error
  while (actual && typeof actual === 'object' && !vistos.has(actual)) {
    vistos.add(actual)
    if (actual.name !== 'MuvInfrastructureError') nativo = actual
    actual = actual.cause
  }
  return nativo
}

/**
 * Node dice "fetch failed" cuando el socket no llega a responder.
 * La pantalla muestra la causa (DNS, TLS, rechazo) y no ese texto ni la URL.
 */
export function describirFalloTransporte(error) {
  const nombre = error?.name
  const propio = error?.code
  const raiz = causaConCodigo(error)
  const codigo = String(raiz?.code || propio || '')
  const agotado =
    nombre === 'AbortError' ||
    nombre === 'TimeoutError' ||
    propio === 'MUV_TIMEOUT' ||
    codigo === 'MUV_TIMEOUT' ||
    codigo === 'ETIMEDOUT' ||
    codigo === 'ABORT_ERR' ||
    codigo === 'UND_ERR_CONNECT_TIMEOUT' ||
    codigo === 'UND_ERR_HEADERS_TIMEOUT' ||
    codigo === 'UND_ERR_BODY_TIMEOUT'
  if (agotado) {
    return {
      code: 'MUV_TIMEOUT',
      status: 504,
      message: 'Tiempo de espera agotado al contactar el MUV.',
    }
  }
  const detalle = CODIGOS_TLS.has(codigo) ? 'certificado TLS' : CODIGOS_RED.has(codigo) ? codigo : ''
  return {
    code: 'MUV_NETWORK',
    status: 503,
    message: detalle ? `No se pudo contactar el MUV (${detalle}).` : 'No se pudo contactar el MUV.',
  }
}

function envolverTransporte(error) {
  if (error instanceof MuvInfrastructureError) return error
  const fallo = describirFalloTransporte(error)
  return new MuvInfrastructureError(fallo.message, {
    code: fallo.code,
    status: fallo.status,
    cause: error,
  })
}

/** Fallos de socket o DNS. Un HTTP 400 del ministerio no entra aquí. */
const CODIGOS_REINTENTO = new Set([
  'ENOTFOUND',
  'EAI_AGAIN',
  'ECONNRESET',
  'ECONNREFUSED',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'ETIMEDOUT',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_SOCKET',
])

function codigoDeRed(error) {
  let actual = error
  const vistos = new Set()
  while (actual && typeof actual === 'object' && !vistos.has(actual)) {
    vistos.add(actual)
    if (CODIGOS_REINTENTO.has(String(actual.code || ''))) return String(actual.code)
    actual = actual.cause
  }
  return ''
}

export function esFalloDeRedReintentable(error) {
  return CODIGOS_REINTENTO.has(codigoDeRed(error))
}

function esperaReintento(numero) {
  const exponencial = BACKOFF_BASE_MS * 2 ** Math.max(0, numero - 1)
  const jitter = Math.floor(Math.random() * 100)
  return Math.min(BACKOFF_TOPE_MS, exponencial + jitter)
}

const esperarMs = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Reintenta solo caídas de DNS o de socket. El último error se propaga.
 * @param {() => Promise<T>} operacion
 * @param {{ reintentos?: number, esperar?: (ms: number) => Promise<void>, etiqueta?: string }} [opciones]
 * @template T
 */
export async function conReintentosDeRed(operacion, opciones = {}) {
  const reintentos = Number.isInteger(opciones.reintentos) ? opciones.reintentos : DEFAULT_REINTENTOS
  const esperar = opciones.esperar ?? esperarMs
  let ultimo
  for (let intento = 0; intento <= reintentos; intento += 1) {
    try {
      return await operacion()
    } catch (error) {
      ultimo = error
      const reintenta = intento < reintentos && esFalloDeRedReintentable(error)
      if (!reintenta) throw error
      const esperaMs = esperaReintento(intento + 1)
      const total = reintentos + 1
      const codigo = codigoDeRed(error)
      console.warn(
        `[MUV RIPS] Fallo de red (${codigo}). Intento ${intento + 1} de ${total}. Reintentando en ${esperaMs} ms....`,
      )
      await esperar(esperaMs)
    }
  }
  throw ultimo
}

function entregarDirecciones(callback, addresses, all) {
  if (all) {
    callback(
      null,
      addresses.map((address) => ({ address, family: 4 })),
    )
    return
  }
  callback(null, addresses[0], 4)
}

/**
 * Cada socket nuevo pregunta el registro A por c-ares, sin el caché de getaddrinfo.
 * Si esa consulta falla, se intenta el resolver del sistema una vez.
 * Una IP literal no consulta DNS.
 * @param {Pick<typeof dns, 'resolve4' | 'lookup'>} [dnsResolver]
 */
export function crearLookupIpv4(dnsResolver = dns) {
  return function lookupIpv4(hostname, options, callback) {
    if (typeof options === 'function') {
      callback = options
      options = {}
    }
    const familiaLiteral = net.isIP(hostname)
    if (familiaLiteral) {
      if (options.all) callback(null, [{ address: hostname, family: familiaLiteral }])
      else callback(null, hostname, familiaLiteral)
      return
    }
    if (hostname === 'localhost' || hostname.endsWith('.local')) {
      dnsResolver.lookup(hostname, { family: 4, all: Boolean(options.all) }, callback)
      return
    }
    dnsResolver.resolve4(hostname, (err, addresses) => {
      if (!err && Array.isArray(addresses) && addresses.length > 0) {
        entregarDirecciones(callback, addresses, options.all)
        return
      }
      dnsResolver.lookup(hostname, { family: 4, all: Boolean(options.all) }, (lookupErr, address, family) => {
        if (lookupErr) {
          callback(err || lookupErr)
          return
        }
        if (options.all) callback(null, address)
        else callback(null, address, family)
      })
    })
  }
}

const lookupIpv4 = crearLookupIpv4()

const opcionesAgente = {
  keepAlive: true,
  keepAliveMsecs: 30_000,
  maxSockets: 32,
  maxFreeSockets: 8,
  scheduling: 'lifo',
}

const agenteHttp = new http.Agent(opcionesAgente)
const agenteHttps = new https.Agent(opcionesAgente)

export function agenteParaProtocolo(protocol) {
  return protocol === 'https:' ? agenteHttps : agenteHttp
}

function emitirRequestJson(url, { method = 'POST', headers = {}, body, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const target = new URL(url)
  const payload = body === undefined ? null : JSON.stringify(body)
  const esHttps = target.protocol === 'https:'
  const lib = esHttps ? https : http
  const requestHeaders = { Accept: 'application/json', ...headers }
  if (payload !== null) requestHeaders['Content-Length'] = Buffer.byteLength(payload)

  return new Promise((resolve, reject) => {
    let settled = false
    const finish = (fn, value) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      fn(value)
    }
    const opciones = {
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port || undefined,
      path: `${target.pathname}${target.search}`,
      method,
      headers: requestHeaders,
      family: 4,
      autoSelectFamily: false,
      lookup: lookupIpv4,
      agent: agenteParaProtocolo(target.protocol),
    }
    if (esHttps && net.isIP(target.hostname) === 0) opciones.servername = target.hostname
    const req = lib.request(opciones, (response) => {
      const chunks = []
      response.on('data', (chunk) => chunks.push(chunk))
      response.on('end', () => {
        const rawText = Buffer.concat(chunks).toString('utf8')
        let data = null
        if (rawText) {
          try {
            data = JSON.parse(rawText)
          } catch {
            data = { message: rawText.slice(0, 2_000) }
          }
        }
        finish(resolve, {
          response: { status: response.statusCode ?? 0, ok: (response.statusCode ?? 0) < 400 },
          data,
        })
      })
      response.on('error', (error) => finish(reject, error))
    })
    const timer = setTimeout(() => {
      const error = new Error('Tiempo de espera agotado al contactar el MUV.')
      error.name = 'TimeoutError'
      error.code = 'MUV_TIMEOUT'
      req.destroy(error)
    }, timeoutMs)
    req.on('error', (error) => finish(reject, error))
    if (payload !== null) req.write(payload)
    req.end()
  })
}

function requestJson(url, options = {}) {
  let host = ''
  try {
    host = new URL(url).hostname
  } catch {
    host = ''
  }
  const reintentos = Number.isInteger(options.reintentos) ? options.reintentos : resolveReintentosDeRed()
  return conReintentosDeRed(() => emitirRequestJson(url, options), { reintentos, etiqueta: host }).catch((error) => {
    throw envolverTransporte(error)
  })
}

export class SisproMuvService {
  /**
   * @param {object} [options]
   * @param {Function} [options.request] Transporte inyectable. Misma firma que el fetch interno.
   * @param {NodeJS.ProcessEnv} [options.env]
   * @param {number} [options.timeoutMs]
   */
  constructor(options = {}) {
    const { request, env, timeoutMs, ...overrides } = options
    const source = env ?? process.env
    try {
      this.settings = resolveMinsaludSettings(source, overrides)
    } catch (error) {
      if (error?.code === 'MUV_CREDENTIALS_MISSING') {
        throw new MuvInfrastructureError(error.message, {
          code: 'MUV_CREDENTIALS_MISSING',
          status: 503,
          cause: error,
        })
      }
      throw error
    }

    this.timeoutMs = Number.isFinite(timeoutMs) && timeoutMs > 0 ? Math.round(timeoutMs) : resolveSisproTimeoutMs(source)
    this._request = request ?? requestJson
    this._cachedToken = null
    this._tokenExpiresAt = 0
    this._pendingAuth = null
    const fevPath = envValue('MINSALUD_CARGAR_FEV_PATH', source) || CARGAR_FEV_PATH
    const sinFacturaPath = envValue('MINSALUD_CARGAR_SIN_FACTURA_PATH', source)
    this.cargarFevUrl = joinUrl(this.settings.baseUrl, fevPath)
    this.cargarSinFacturaUrl = sinFacturaPath
      ? joinUrl(this.settings.baseUrl, sinFacturaPath)
      : this.settings.cargarSinFacturaUrl
  }

  _isTokenFresh() {
    return Boolean(this._cachedToken) && Date.now() < this._tokenExpiresAt - TOKEN_RENEW_SKEW_MS
  }

  async _authenticate() {
    if (this._isTokenFresh()) return { token: this._cachedToken, fromCache: true }
    if (this._pendingAuth) return this._pendingAuth
    this._pendingAuth = this._login().finally(() => {
      this._pendingAuth = null
    })
    return this._pendingAuth
  }

  async _login() {
    const { settings } = this
    let response
    let data
    try {
      const result = await this._request(settings.loginUrl, {
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: {
          persona: {
            identificacion: {
              tipo: settings.tipoDocumento,
              numero: settings.numeroDocumento,
            },
          },
          clave: settings.clave,
          nit: settings.nit,
          tipoUsuario: settings.tipoUsuario,
          appVersion: settings.appVersion,
          tipoMecanismoValidacion: settings.tipoMecanismoValidacion,
        },
        timeoutMs: this.timeoutMs,
      })
      response = result.response
      data = result.data
    } catch (error) {
      throw envolverTransporte(error)
    }

    const token = extractToken(data)
    const accepted = response?.ok && data?.login === true && Boolean(token)
    if (!accepted) {
      this._cachedToken = null
      this._tokenExpiresAt = 0
      throw new MuvInfrastructureError('Autenticación LoginSISPRO rechazada.', {
        code: 'MUV_AUTH',
        status: 503,
        httpStatus: response?.status ?? null,
        errors: loginErrors(data).map((message) => ({
          code: 'MUV_AUTH',
          message,
          path: '',
          clase: 'AUTH',
        })),
      })
    }

    this._cachedToken = token
    this._tokenExpiresAt = jwtExpiryMs(token) ?? Date.now() + DEFAULT_TOKEN_TTL_MS
    return { token, fromCache: false }
  }

  /**
   * Radica un sobre RIPS.
   * @param {{ rips?: object, cufe?: string, xmlFevFile?: string, evolutionId?: string, patientId?: string }} envelope
   * @returns {Promise<{ success: true, cuv: string } | { success: false, errors: object[] }>}
   */
  async enviar(envelope = {}) {
    const canal = canalDeEnvio(envelope)
    const rips = ripsParaMinisterio(envelope.rips && typeof envelope.rips === 'object' ? envelope.rips : envelope)
    const xml = canal === 'fev' ? codificarXmlFev(leerXmlFev(envelope)) : ''
    const url = canal === 'fev' ? this.cargarFevUrl : this.cargarSinFacturaUrl
    const started = Date.now()
    console.info('[sispro-muv] enviando', {
      canal,
      timeoutMs: this.timeoutMs,
      evolutionId: envelope.evolutionId ?? null,
    })

    try {
      const auth = await this._authenticate()
      const { response, data } = await this._request(url, {
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: `Bearer ${auth.token}`,
        },
        body: { rips, xmlFevFile: xml },
        timeoutMs: this.timeoutMs,
      })
      if (response?.status === 401 || response?.status === 403) {
        this._cachedToken = null
        this._tokenExpiresAt = 0
      }
      const parsed = interpretarRespuestaSispro(response?.status, data)
      const durationMs = Date.now() - started
      if (parsed.success) {
        console.info('[sispro-muv] CUV recibido', { canal, httpStatus: parsed.httpStatus, durationMs })
      } else {
        console.warn('[sispro-muv] validación rechazada', {
          canal,
          httpStatus: parsed.httpStatus,
          errores: parsed.errors.length,
          durationMs,
        })
      }
      return { ...parsed, canal, durationMs }
    } catch (error) {
      const durationMs = Date.now() - started
      const wrapped = envolverTransporte(error)
      if (wrapped.code === 'MUV_AUTH') {
        this._cachedToken = null
        this._tokenExpiresAt = 0
      }
      wrapped.canal = canal
      wrapped.durationMs = durationMs
      const nativo = errorNativoDeTransporte(error)
      console.error(
        '[sispro-muv] infraestructura',
        {
          canal,
          code: wrapped.code,
          httpStatus: wrapped.httpStatus ?? null,
          durationMs,
          message: wrapped.message,
          detalle: Array.isArray(wrapped.errors)
            ? wrapped.errors.map((item) => item?.message).filter(Boolean)
            : [],
          nativeCode: nativo?.code ?? null,
          nativeMessage: nativo?.message ?? null,
        },
        nativo,
      )
      throw wrapped
    }
  }
}
