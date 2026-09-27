import { config, hasMinsaludCredentials } from '../config.js'

let cachedToken = null
let tokenExpiresAt = 0

/**
 * Sandbox (o sin credenciales de producción) no llama al Ministerio.
 */
export function shouldUseMinsaludSandbox() {
  return config.minsalud.sandbox || !hasMinsaludCredentials()
}

function encodeBase64Url(value) {
  return Buffer.from(value).toString('base64url')
}

/**
 * Credenciales de Profesional Independiente habilitado en REPS para LoginSISPRO.
 */
export function buildCredencialesProfesionalIndependiente() {
  const {
    tipoDocumento,
    numDocumento,
    username,
    password,
    nit,
    codPrestadorReps,
    tipoPrestador,
  } = config.minsalud

  const credenciales = {
    persona: {
      identificacion: {
        tipo: tipoDocumento || 'CC',
        numero: numDocumento || username || '0000000000',
      },
    },
    clave: password || 'sandbox-reps',
    nit: nit || '900000000',
    tipoPrestador: tipoPrestador || 'independiente',
  }

  if (codPrestadorReps) {
    credenciales.codPrestador = codPrestadorReps
  }

  return credenciales
}

/**
 * POST /api/Auth/LoginSISPRO — cuerpo y URL del login oficial.
 */
export function buildLoginSisproRequest() {
  const path = config.minsalud.authPath || '/api/Auth/LoginSISPRO'
  const url = config.minsalud.authUrl || (config.minsalud.apiBaseUrl ? `${config.minsalud.apiBaseUrl}${path}` : path)
  return {
    method: 'POST',
    url,
    path,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: buildCredencialesProfesionalIndependiente(),
  }
}

function buildSimulatedJwt(credenciales) {
  const now = Math.floor(Date.now() / 1000)
  const claims = {
    sub: credenciales.persona.identificacion.numero,
    nit: credenciales.nit,
    tipoPrestador: credenciales.tipoPrestador,
    reps: credenciales.codPrestador ?? null,
    iat: now,
    exp: now + 3600,
  }
  const header = encodeBase64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const payload = encodeBase64Url(JSON.stringify(claims))
  const signature = encodeBase64Url(`sandbox.${claims.sub}.${claims.exp}`)
  return { token: `${header}.${payload}.${signature}`, expiresIn: 3600 }
}

function cacheToken(token, expiresInSeconds) {
  cachedToken = token
  tokenExpiresAt = Date.now() + (expiresInSeconds ?? 3600) * 1000
  return cachedToken
}

/**
 * Obtiene el Bearer token SISPRO.
 * En sandbox simula el POST a /api/Auth/LoginSISPRO y retorna un JWT.
 * Con credenciales de producción ejecuta el POST real.
 */
export async function obtenerTokenSISPRO() {
  if (cachedToken && Date.now() < tokenExpiresAt - 60_000) {
    return cachedToken
  }

  const request = buildLoginSisproRequest()

  if (shouldUseMinsaludSandbox()) {
    const simulated = buildSimulatedJwt(request.body)
    return cacheToken(simulated.token, simulated.expiresIn)
  }

  const response = await fetch(request.url, {
    method: 'POST',
    headers: request.headers,
    body: JSON.stringify(request.body),
  })

  const data = await response.json().catch(() => ({}))
  if (!response.ok || data.login === false) {
    const error = new Error('Autenticación MinSalud fallida')
    error.status = 502
    error.details = data
    throw error
  }

  const token = data.token ?? data.access_token
  if (!token) {
    const error = new Error('Autenticación MinSalud fallida')
    error.status = 502
    error.details = data
    throw error
  }

  return cacheToken(token, data.expires_in ?? data.expiresIn ?? 3600)
}

export function clearMinsaludTokenCache() {
  cachedToken = null
  tokenExpiresAt = 0
}
