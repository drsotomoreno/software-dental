import { config, hasMinsaludCredentials } from '../config.js'

let cachedToken = null
let tokenExpiresAt = 0

/**
 * Obtiene token de autenticación técnica para el API SISPRO/PISIS.
 * Soporta client_credentials OAuth2 o usuario/contraseña según configuración.
 */
export async function getMinsaludAccessToken() {
  if (cachedToken && Date.now() < tokenExpiresAt - 60_000) {
    return cachedToken
  }

  if (!hasMinsaludCredentials()) {
    return null
  }

  const { apiBaseUrl, authUrl, clientId, clientSecret, username, password } = config.minsalud
  const tokenUrl = authUrl || `${apiBaseUrl}/oauth/token`

  const body = clientId && clientSecret
    ? new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
        scope: 'rips.validar',
      })
    : new URLSearchParams({
        grant_type: 'password',
        username,
        password,
        scope: 'rips.validar',
      })

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })

  if (!response.ok) {
    const text = await response.text()
    const error = new Error('Autenticación MinSalud fallida')
    error.status = 502
    error.details = text
    throw error
  }

  const data = await response.json()
  cachedToken = data.access_token
  tokenExpiresAt = Date.now() + (data.expires_in ?? 3600) * 1000
  return cachedToken
}

export function clearMinsaludTokenCache() {
  cachedToken = null
  tokenExpiresAt = 0
}
