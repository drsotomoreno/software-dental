/**
 * Cliente del Mecanismo Único de Validación (FEV-RIPS / LoginSISPRO).
 * El Stage exige tipo y número de documento por separado y, cuando el
 * documento del profesional coincide con el NIT, tipoUsuario PIN.
 */

import http from 'node:http'
import https from 'node:https'

const SANDBOX_BASE_URL = 'https://stage-fevrips.sispropreprod.gov.co/fevrips-api'
const PRODUCTION_BASE_URL = 'https://fevrips.sispro.gov.co/fevrips-api'
const LOGIN_PATH = '/api/Auth/LoginSISPRO'
const CARGAR_SIN_FACTURA_PATH = '/api/PaquetesFevRips/CargarRipsSinFactura'
const DEFAULT_APP_VERSION = '5.4.11'
const DEFAULT_TIPO_MECANISMO = 1
const TOKEN_RENEW_SKEW_MS = 60_000
const DEFAULT_TOKEN_TTL_MS = 50 * 60 * 1000

const DOCUMENT_TYPE_CODES = ['CC', 'CE', 'PA', 'RC', 'TI', 'NV', 'CD', 'SC', 'PE', 'PT', 'NI']

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
 * MINSALUD_USERNAME puede venir como número (79904620) o como tipo+número (CC79904620).
 * @param {string} raw
 * @param {string} [tipoPreferido]
 * @returns {{ tipo: string, numero: string }}
 */
export function splitUsuarioDocumento(raw, tipoPreferido) {
  const value = String(raw ?? '').trim().toUpperCase()
  const preferido = String(tipoPreferido || 'CC').trim().toUpperCase()
  if (value.startsWith(preferido) && value.length > preferido.length) {
    const resto = value.slice(preferido.length)
    if (/^[A-Z0-9]+$/.test(resto)) return { tipo: preferido, numero: resto }
  }
  for (const code of DOCUMENT_TYPE_CODES) {
    if (value.startsWith(code) && /^\d+$/.test(value.slice(code.length))) {
      return { tipo: code, numero: value.slice(code.length) }
    }
  }
  return { tipo: preferido, numero: value }
}

/**
 * PIN cuando el documento coincide con el NIT. RE exige que sean distintos.
 * @param {string} explicit
 * @param {string} numeroDocumento
 * @param {string} nit
 * @returns {string}
 */
export function resolveTipoUsuario(explicit, numeroDocumento, nit) {
  const configured = String(explicit ?? '').trim().toUpperCase()
  if (configured) return configured
  if (numeroDocumento && nit && digitsOnly(numeroDocumento) === digitsOnly(nit)) return 'PIN'
  return ''
}

/**
 * @param {NodeJS.ProcessEnv} [source]
 * @param {object} [overrides]
 */
export function readFevRipsSettings(source = process.env, overrides = {}) {
  const sandbox = envValue('MINSALUD_SANDBOX', source) !== 'false'
  const baseUrl = (
    overrides.baseUrl ||
    envValue('MINSALUD_API_BASE_URL', source) ||
    (sandbox ? SANDBOX_BASE_URL : PRODUCTION_BASE_URL)
  ).replace(/\/$/, '')
  const identidad = splitUsuarioDocumento(
    overrides.username ?? envValue('MINSALUD_USERNAME', source),
    overrides.tipoDocumento ?? (envValue('MINSALUD_TIPO_DOCUMENTO', source) || 'CC'),
  )
  const nit = digitsOnly(overrides.nit ?? envValue('MINSALUD_NIT', source))
  const tipoUsuario = resolveTipoUsuario(
    overrides.tipoUsuario ?? envValue('MINSALUD_TIPO_USUARIO', source),
    identidad.numero,
    nit,
  )

  return {
    sandbox,
    baseUrl,
    loginUrl: overrides.loginUrl || envValue('MINSALUD_AUTH_URL', source) || joinUrl(baseUrl, LOGIN_PATH),
    cargarSinFacturaUrl: joinUrl(baseUrl, CARGAR_SIN_FACTURA_PATH),
    tipoDocumento: identidad.tipo,
    numeroDocumento: identidad.numero,
    clave: overrides.password ?? envValue('MINSALUD_PASSWORD', source),
    nit,
    tipoUsuario,
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
            rawText,
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

function buildLoginBody(settings) {
  const body = {
    persona: {
      identificacion: {
        tipo: settings.tipoDocumento,
        numero: settings.numeroDocumento,
      },
    },
    clave: settings.clave,
    nit: settings.nit,
    appVersion: settings.appVersion,
    tipoMecanismoValidacion: settings.tipoMecanismoValidacion,
  }
  if (settings.tipoUsuario) body.tipoUsuario = settings.tipoUsuario
  return body
}

export class FevRipsService {
  /**
   * @param {object} [options]
   * @param {Function} [options.request] Transporte inyectable para pruebas.
   */
  constructor(options = {}) {
    const { request, ...overrides } = options
    this.settings = readFevRipsSettings(process.env, overrides)
    this._request = request ?? requestJson
    this._cachedToken = null
    this._tokenExpiresAt = 0
    this._pendingAuth = null
  }

  _isTokenFresh() {
    return Boolean(this._cachedToken) && Date.now() < this._tokenExpiresAt - TOKEN_RENEW_SKEW_MS
  }

  /**
   * LoginSISPRO. Reutiliza el token en memoria mientras no esté por vencer.
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
    const { response, data } = await this._request(this.settings.loginUrl, {
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: buildLoginBody(this.settings),
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
   * Envía un RIPS sin factura electrónica al MUV.
   * @param {object} payloadJSON Paquete RIPS (numDocumentoIdObligado, usuarios, …).
   * @returns {Promise<{ httpStatus: number, data: object | null, fromCache: boolean, tokenLength: number }>}
   */
  async enviarRipsSinFactura(payloadJSON) {
    const auth = await this._authenticate()
    const { response, data } = await this._request(this.settings.cargarSinFacturaUrl, {
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

    return {
      httpStatus: response.status,
      data,
      fromCache: auth.fromCache,
      tokenLength: auth.token.length,
    }
  }
}
