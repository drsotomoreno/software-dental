import { config, MSPS_STAGE_URL } from '../config.js'

/** Vigencia informada por SISPRO: 2 horas. Se recorta 5 minutos por desfase de reloj. */
const TOKEN_TTL_MS = 115 * 60 * 1000
/** Reutilizar el token solo si le quedan más de 5 minutos. */
const TOKEN_REUSE_MARGIN_MS = 5 * 60 * 1000

/** @type {Map<string, { token: string, expiresAt: number }>} */
const tokenCaches = new Map()

export function minsaludApiBaseUrl() {
  return (config.minsalud.apiBaseUrl || MSPS_STAGE_URL).replace(/\/$/, '')
}

/** Endpoint oficial de autenticación del validador de RIPS (ambiente de pruebas). */
export function minsaludAuthEndpoint() {
  const configured = String(config.minsalud.authUrl ?? '').trim()
  if (configured) return configured.replace(/\/$/, '')
  return `${minsaludApiBaseUrl()}/api/v1/auth`
}

function cacheKey(tipoUsuario, numeroDocumento, nitObligado) {
  return `${tipoUsuario}|${numeroDocumento}|${nitObligado}`
}

/**
 * Autenticación real ante el servicio del Ministerio de Salud (vigencia de token: 2 horas).
 * @param {string} tipoUsuario
 * @param {string} numeroDocumento
 * @param {string} nitObligado
 * @returns {Promise<string>}
 */
export async function obtenerTokenRealMinisterio(tipoUsuario, numeroDocumento, nitObligado) {
  const ahora = Date.now()
  const key = cacheKey(tipoUsuario, numeroDocumento, nitObligado)
  const tokenCache = tokenCaches.get(key)

  if (tokenCache && tokenCache.expiresAt > ahora + TOKEN_REUSE_MARGIN_MS) {
    return tokenCache.token
  }

  const response = await fetch(minsaludAuthEndpoint(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      tipoUsuario,
      numeroDocumento,
      nitObligado,
    }),
  })

  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    const mensaje = data?.mensaje || data?.message || response.statusText
    throw new Error(`Fallo de autenticación con el MSPS: ${mensaje}`)
  }

  const token = data.token || data.access_token
  if (!token) {
    throw new Error('Fallo de autenticación con el MSPS: la respuesta no incluye token')
  }

  tokenCaches.set(key, {
    token,
    expiresAt: ahora + TOKEN_TTL_MS,
  })
  return token
}

/**
 * Token técnico con las credenciales configuradas del prestador.
 * @returns {Promise<string|null>}
 */
export async function getMinsaludAccessToken() {
  const { tipoUsuario, numeroDocumento, nit } = config.minsalud
  if (!tipoUsuario || !numeroDocumento || !nit) return null
  return obtenerTokenRealMinisterio(tipoUsuario, numeroDocumento, nit)
}

export function clearMinsaludTokenCache() {
  tokenCaches.clear()
}
