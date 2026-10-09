/**
 * Cliente del MUV (LoginSISPRO + CargarRipsSinFactura).
 * El token queda en memoria y se renueva si faltan menos de 5 minutos.
 * El login separa MINSALUD_USERNAME en tipo y número, y envía tipoUsuario PIN.
 */

import http from 'node:http'
import https from 'node:https'
import { splitUsuarioDocumento } from './fevRipsService.js'

const SANDBOX_BASE_URL = 'https://stage-fevrips.sispropreprod.gov.co/fevrips-api'
const PRODUCTION_BASE_URL = 'https://fevrips.sispro.gov.co/fevrips-api'
const LOGIN_PATH = '/api/Auth/LoginSISPRO'
const CARGAR_SIN_FACTURA_PATH = '/api/PaquetesFevRips/CargarRipsSinFactura'
const DEFAULT_APP_VERSION = '5.4.11'
const DEFAULT_TIPO_MECANISMO = 1
const TOKEN_RENEW_SKEW_MS = 5 * 60 * 1000
const DEFAULT_TOKEN_TTL_MS = 50 * 60 * 1000

const AUTH_ENV = ['MINSALUD_USERNAME', 'MINSALUD_PASSWORD', 'MINSALUD_NIT']

function envValue(name, source = process.env) {
  const value = source[name]
  return typeof value === 'string' ? value.trim() : ''
}

function digitsOnly(value) {
  return String(value ?? '').replace(/\D/g, '')
}

function joinUrl(base, path) {
  const root = String(base ?? '').replace(/\/$/, '')
  const suffix = path.startsWith('/') ? path : `/${path}`
  return `${root}${suffix}`
}

function isLocalHttps(url) {
  return /^https:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/i.test(url)
}

/**
 * Falla al construir el servicio si no hay usuario, clave o NIT.
 * @param {NodeJS.ProcessEnv} source
 * @param {object} overrides
 */
export function resolveMinsaludSettings(source = process.env, overrides = {}) {
  const username = overrides.username ?? envValue('MINSALUD_USERNAME', source)
  const password = overrides.password ?? envValue('MINSALUD_PASSWORD', source)
  const nit = digitsOnly(overrides.nit ?? envValue('MINSALUD_NIT', source))
  const missing = []
  if (!String(username ?? '').trim()) missing.push('MINSALUD_USERNAME')
  if (!String(password ?? '').trim()) missing.push('MINSALUD_PASSWORD')
  if (!nit) missing.push('MINSALUD_NIT')
  if (missing.length > 0) {
    const error = new Error(
      `Faltan credenciales del MUV: ${missing.join(', ')}. Copia .env.example como .env y configura los datos de prueba del prestador.`,
    )
    error.code = 'MUV_CREDENTIALS_MISSING'
    error.missing = missing
    throw error
  }

  const sandbox = envValue('MINSALUD_SANDBOX', source) !== 'false'
  const baseUrl = (
    overrides.baseUrl ||
    envValue('MINSALUD_API_BASE_URL', source) ||
    (sandbox ? SANDBOX_BASE_URL : PRODUCTION_BASE_URL)
  ).replace(/\/$/, '')
  const identidad = splitUsuarioDocumento(
    username,
    overrides.tipoDocumento ?? (envValue('MINSALUD_TIPO_DOCUMENTO', source) || 'CC'),
  )

  return {
    sandbox,
    baseUrl,
    loginUrl: overrides.loginUrl || envValue('MINSALUD_AUTH_URL', source) || joinUrl(baseUrl, LOGIN_PATH),
    cargarSinFacturaUrl: joinUrl(baseUrl, CARGAR_SIN_FACTURA_PATH),
    tipoDocumento: identidad.tipo,
    numeroDocumento: identidad.numero,
    clave: password,
    nit,
    tipoUsuario: 'PIN',
    appVersion: overrides.appVersion || envValue('MINSALUD_APP_VERSION', source) || DEFAULT_APP_VERSION,
    tipoMecanismoValidacion: Number(
      overrides.tipoMecanismoValidacion ??
        (envValue('MINSALUD_TIPO_MECANISMO', source) || DEFAULT_TIPO_MECANISMO),
    ),
    codPrestador: digitsOnly(
      overrides.codPrestador || envValue('MINSALUD_COD_PRESTADOR', source) || '680010389801',
    ),
    pacienteTipoDocumento: String(
      overrides.pacienteTipoDocumento || envValue('MINSALUD_PACIENTE_TIPO_DOCUMENTO', source) || identidad.tipo,
    ).toUpperCase(),
    pacienteDocumento: digitsOnly(
      overrides.pacienteDocumento || envValue('MINSALUD_PACIENTE_DOCUMENTO', source) || identidad.numero,
    ),
  }
}

function requestJson(url, { method = 'POST', headers = {}, body } = {}) {
  const target = new URL(url)
  const payload = body === undefined ? null : JSON.stringify(body)
  const lib = target.protocol === 'https:' ? https : http
  const requestHeaders = { ...headers }
  if (payload !== null) requestHeaders['Content-Length'] = Buffer.byteLength(payload)

  return new Promise((resolve, reject) => {
    const req = lib.request(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port || undefined,
        path: `${target.pathname}${target.search}`,
        method,
        headers: requestHeaders,
        rejectUnauthorized: !isLocalHttps(url),
      },
      (response) => {
        const chunks = []
        response.on('data', (chunk) => chunks.push(chunk))
        response.on('end', () => {
          const rawText = Buffer.concat(chunks).toString('utf8')
          let data = null
          if (rawText) {
            try {
              data = JSON.parse(rawText)
            } catch {
              data = { message: rawText }
            }
          }
          resolve({
            response: { status: response.statusCode ?? 0, ok: (response.statusCode ?? 0) < 400 },
            data,
          })
        })
      },
    )
    req.on('error', reject)
    if (payload !== null) req.write(payload)
    req.end()
  })
}

function loginErrors(data) {
  if (!data || typeof data !== 'object') return []
  if (Array.isArray(data.errors)) return data.errors.map(String)
  if (Array.isArray(data.Errors)) return data.Errors.map(String)
  if (data.Errors && typeof data.Errors === 'object') {
    return Object.entries(data.Errors).flatMap(([field, messages]) => {
      const list = Array.isArray(messages) ? messages : [messages]
      return list.map((message) => `${field}: ${message}`)
    })
  }
  if (typeof data.message === 'string') return [data.message]
  if (typeof data.Detail === 'string') return [data.Detail]
  return []
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

function validationItems(data) {
  const items = data?.ResultadosValidacion ?? data?.resultadosValidacion ?? []
  return Array.isArray(items) ? items : []
}

function cleanCuv(value, resultState) {
  if (resultState !== true) return null
  const cuv = String(value ?? '').replace(/\s/g, '').trim()
  if (!cuv || cuv === '-') return null
  return cuv
}

export class MinsaludService {
  /**
   * @param {object} [options]
   * @param {Function} [options.request] Transporte inyectable para pruebas.
   * @param {NodeJS.ProcessEnv} [options.env] Entorno alterno; por defecto process.env.
   */
  constructor(options = {}) {
    const { request, env, ...overrides } = options
    this.settings = resolveMinsaludSettings(env ?? process.env, overrides)
    this._request = request ?? requestJson
    this._cachedToken = null
    this._tokenExpiresAt = 0
    this._pendingAuth = null
  }

  _isTokenFresh() {
    return Boolean(this._cachedToken) && Date.now() < this._tokenExpiresAt - TOKEN_RENEW_SKEW_MS
  }

  /**
   * LoginSISPRO. Reutiliza el JWT hasta 5 minutos antes de que expire.
   * @returns {Promise<{ token: string, fromCache: boolean }>}
   */
  async _authenticate() {
    if (this._isTokenFresh()) {
      return { token: this._cachedToken, fromCache: true }
    }
    if (this._pendingAuth) return this._pendingAuth

    this._pendingAuth = this._login().finally(() => {
      this._pendingAuth = null
    })
    return this._pendingAuth
  }

  async _login() {
    const { settings } = this
    const { response, data } = await this._request(settings.loginUrl, {
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
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
    })

    const token = extractToken(data)
    const accepted = response.ok && data?.login === true && Boolean(token)
    if (!accepted) {
      this._cachedToken = null
      this._tokenExpiresAt = 0
      const error = new Error('Autenticación LoginSISPRO rechazada')
      error.status = response.status
      error.errors = loginErrors(data)
      error.data = data
      throw error
    }

    this._cachedToken = token
    this._tokenExpiresAt = jwtExpiryMs(token) ?? Date.now() + DEFAULT_TOKEN_TTL_MS
    return { token, fromCache: false }
  }

  /**
   * Radica un RIPS sin factura. No lanza si el ministerio rechaza el paquete:
   * el resultado queda en resultState y resultadosValidacion.
   * @param {object} payloadJSON
   * @returns {Promise<{ CUV: string | null, resultState: boolean, resultadosValidacion: object[] }>}
   */
  async enviarRipsSinFactura(payloadJSON) {
    const auth = await this._authenticate()
    const { data } = await this._request(this.settings.cargarSinFacturaUrl, {
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${auth.token}`,
      },
      body: {
        rips: payloadJSON,
        xmlFevFile: '',
      },
    })

    const resultState = data?.ResultState === true || data?.resultState === true
    const cuv = data?.CodigoUnicoValidacion ?? data?.codigoUnicoValidacion ?? data?.CUV ?? data?.cuv
    return {
      CUV: cleanCuv(cuv, resultState),
      resultState,
      resultadosValidacion: validationItems(data),
    }
  }
}

export { AUTH_ENV, TOKEN_RENEW_SKEW_MS }
