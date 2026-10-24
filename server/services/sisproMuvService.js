/**
 * Cliente de radicación RIPS contra el MUV/SISPRO.
 * Vive en el servidor para que el bearer y la clave del prestador no entren al bundle de Vite.
 * Con CUFE o XML usa CargarFevRips; sin ellos, CargarRipsSinFactura.
 * El login reutiliza el contrato LoginSISPRO (tipoUsuario PIN) de resolveMinsaludSettings.
 */

import { resolveMinsaludSettings } from './minsaludService.js'

const CARGAR_FEV_PATH = '/api/PaquetesFevRips/CargarFevRips'
const DEFAULT_TIMEOUT_MS = 45_000
const MIN_TIMEOUT_MS = 1_000
const MAX_TIMEOUT_MS = 180_000
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
  return erroresModelo(data).map((item) => item.message).filter(Boolean)
}

function envolverTransporte(error) {
  if (error instanceof MuvInfrastructureError) return error
  const nombre = error?.name
  const code = error?.code
  const agotado = nombre === 'AbortError' || nombre === 'TimeoutError' || code === 'MUV_TIMEOUT' || code === 'ETIMEDOUT' || code === 'ABORT_ERR'
  return new MuvInfrastructureError(
    agotado ? 'Tiempo de espera agotado al contactar el MUV.' : 'No se pudo contactar el MUV.',
    {
      code: agotado ? 'MUV_TIMEOUT' : 'MUV_NETWORK',
      status: agotado ? 504 : 503,
      cause: error,
    },
  )
}

async function requestJson(url, { method = 'POST', headers = {}, body, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    })
    const rawText = await response.text()
    let data = null
    if (rawText) {
      try {
        data = JSON.parse(rawText)
      } catch {
        data = { message: rawText.slice(0, 2_000) }
      }
    }
    return { response: { status: response.status, ok: response.ok }, data }
  } catch (error) {
    throw envolverTransporte(error)
  } finally {
    clearTimeout(timer)
  }
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
          tipoUsuario: 'PIN',
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
      console.error('[sispro-muv] infraestructura', {
        canal,
        code: wrapped.code,
        httpStatus: wrapped.httpStatus ?? null,
        durationMs,
        message: wrapped.message,
      })
      throw wrapped
    }
  }
}
