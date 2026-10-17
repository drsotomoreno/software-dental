import { MinsaludAuthConfigError } from './errors.js'
import { assertDocumentType, assertUserType } from './settings.js'

/**
 * @param {Record<string, unknown> | null} payload
 */
export function tokenFromPayload(payload) {
  if (typeof payload === 'string') {
    return payload.split('.').length === 3 ? payload : ''
  }
  if (!payload || typeof payload !== 'object') return ''
  const record = /** @type {Record<string, unknown>} */ (payload)
  const nested = record.data && typeof record.data === 'object'
    ? /** @type {Record<string, unknown>} */ (record.data)
    : null
  const candidates = [
    record.token,
    record.Token,
    record.access_token,
    record.accessToken,
    nested?.token,
    nested?.access_token,
  ]
  const token = candidates.find((item) => typeof item === 'string' && item.length > 0)
  return typeof token === 'string' ? token : ''
}

/**
 * @param {string} token
 */
export function jwtExpiryMs(token) {
  const parts = token.split('.')
  if (parts.length < 2) return null
  try {
    const json = Buffer.from(parts[1], 'base64url').toString('utf8')
    const payload = JSON.parse(json)
    return typeof payload.exp === 'number' && Number.isFinite(payload.exp) ? payload.exp * 1000 : null
  } catch {
    return null
  }
}

/**
 * @param {unknown} payload
 * @param {string} token
 * @param {number} now
 * @param {number} fallbackTtlSeconds
 */
export function expiryFromLogin(payload, token, now, fallbackTtlSeconds) {
  const fromJwt = jwtExpiryMs(token)
  if (fromJwt) return fromJwt
  if (payload && typeof payload === 'object') {
    const record = /** @type {Record<string, unknown>} */ (payload)
    const seconds = record.expires_in ?? record.expiresIn ?? record.expiraEn
    if (typeof seconds === 'number' && Number.isFinite(seconds) && seconds > 0) {
      return now + seconds * 1000
    }
  }
  return now + fallbackTtlSeconds * 1000
}

/**
 * @param {unknown} payload
 */
export function loginRejected(payload) {
  if (!payload || typeof payload !== 'object') return false
  const record = /** @type {Record<string, unknown>} */ (payload)
  return record.login === false || record.Login === false
}

/**
 * @param {unknown} payload
 */
export function messageFromPayload(payload) {
  if (!payload || typeof payload !== 'object') return ''
  const record = /** @type {Record<string, unknown>} */ (payload)
  if (typeof record.message === 'string') return record.message
  if (typeof record.Message === 'string') return record.Message
  if (typeof record.error_description === 'string') return record.error_description
  const errors = record.errors ?? record.Errors ?? record.errores
  if (typeof errors === 'string') return errors
  if (!Array.isArray(errors)) return ''
  return errors
    .map((item) => {
      if (typeof item === 'string') return item
      if (!item || typeof item !== 'object') return ''
      const row = /** @type {Record<string, unknown>} */ (item)
      const text = row.message ?? row.descripcion ?? row.Descripcion ?? row.error
      return typeof text === 'string' ? text : ''
    })
    .filter(Boolean)
    .join('; ')
}

/**
 * Rechazo explícito de credenciales: no se reintenta para no bloquear SISPRO.
 *
 * @param {unknown} payload
 */
export function definitiveCredentialRejection(payload) {
  if (loginRejected(payload)) return true
  const message = messageFromPayload(payload).toLowerCase()
  return /clave|contrase|credential|invalid_client|invalid_grant|usuario o clave|no autorizado/.test(message)
}

/**
 * @param {ReturnType<import('./settings.js').readMinsaludAuthSettings>} settings
 */
export function resolveLoginUrl(settings) {
  if (settings.authMode === 'client_credentials') {
    if (!settings.authUrl || !settings.clientId || !settings.clientSecret) {
      throw new MinsaludAuthConfigError(
        'Modo client_credentials: defina MINSALUD_AUTH_URL, MINSALUD_CLIENT_ID y MINSALUD_CLIENT_SECRET. El MUV no publica /oauth/token.',
      )
    }
    return settings.authUrl
  }

  if (settings.authUrl) return settings.authUrl
  if (!settings.apiBaseUrl) {
    throw new MinsaludAuthConfigError(
      'Falta MINSALUD_API_BASE_URL o MINSALUD_AUTH_URL para LoginSISPRO.',
    )
  }
  const path = settings.authPath.startsWith('/') ? settings.authPath : `/${settings.authPath}`
  return `${settings.apiBaseUrl}${path}`
}

/**
 * Cuerpo de LoginSISPRO. tipoUsuario, tipoMecanismoValidacion y reps
 * solo viajan si el entorno los define (contrato v4.3 y compatibilidad v1).
 *
 * @param {ReturnType<import('./settings.js').readMinsaludAuthSettings>} settings
 */
export function buildLoginSisproBody(settings) {
  if (!settings.numeroDocumento || !settings.clave || !settings.nit) {
    throw new MinsaludAuthConfigError(
      'Faltan credenciales SISPRO. Defina MINSALUD_NUMERO_DOCUMENTO (o MINSALUD_USERNAME), MINSALUD_CLAVE (o MINSALUD_PASSWORD) y MINSALUD_NIT.',
    )
  }

  try {
    assertDocumentType(settings.tipoDocumento)
    assertUserType(settings.tipoUsuario)
  } catch (error) {
    throw new MinsaludAuthConfigError(error instanceof Error ? error.message : 'Credenciales SISPRO inválidas.')
  }

  if (
    settings.tipoMecanismoValidacion !== null &&
    !Number.isInteger(settings.tipoMecanismoValidacion)
  ) {
    throw new MinsaludAuthConfigError('MINSALUD_TIPO_MECANISMO_VALIDACION debe ser un entero.')
  }

  /** @type {Record<string, unknown>} */
  const body = {
    persona: {
      identificacion: {
        tipo: settings.tipoDocumento,
        numero: settings.numeroDocumento,
      },
    },
    clave: settings.clave,
    nit: settings.nit,
  }
  if (settings.tipoUsuario) body.tipoUsuario = settings.tipoUsuario
  if (settings.tipoMecanismoValidacion !== null) {
    body.tipoMecanismoValidacion = settings.tipoMecanismoValidacion
  }
  if (settings.reps !== null) body.reps = settings.reps
  return body
}

/**
 * @param {ReturnType<import('./settings.js').readMinsaludAuthSettings>} settings
 * @returns {{ url: string, method: 'POST', headers: Record<string, string>, body: string }}
 */
export function buildAuthRequest(settings) {
  const url = resolveLoginUrl(settings)
  if (settings.authMode === 'client_credentials') {
    const params = new URLSearchParams({ grant_type: 'client_credentials' })
    if (settings.clientScope) params.set('scope', settings.clientScope)
    /** @type {Record<string, string>} */
    const headers = { 'Content-Type': 'application/x-www-form-urlencoded' }
    if (settings.clientAuth === 'basic') {
      const raw = `${settings.clientId}:${settings.clientSecret}`
      headers.Authorization = `Basic ${Buffer.from(raw).toString('base64')}`
    } else {
      params.set('client_id', settings.clientId)
      params.set('client_secret', settings.clientSecret)
    }
    return { url, method: 'POST', headers, body: params.toString() }
  }

  return {
    url,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildLoginSisproBody(settings)),
  }
}
