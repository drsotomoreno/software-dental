import { config } from '../config.js'
import { createMinsaludAuthClient } from './minsalud/authClient.js'
import { credentialsAreConfigured } from './minsalud/settings.js'

export {
  MinsaludAuthError,
  MinsaludAuthConfigError,
  MinsaludAuthUnauthorizedError,
  MinsaludAuthForbiddenError,
  MinsaludAuthUpstreamError,
  MinsaludAuthNetworkError,
  MinsaludAuthInvalidResponseError,
} from './minsalud/errors.js'

export { createMinsaludAuthClient } from './minsalud/authClient.js'

/**
 * Cliente de proceso. Renueva el JWT antes de `exp` mientras el servidor vive.
 * Las credenciales salen de `config.minsalud` (variables de entorno).
 */
const client = createMinsaludAuthClient({
  getConfig: () => config.minsalud,
  autoRenew: true,
})

/** Bearer Token vigente. Renueva solo si falta o entra en la ventana de expiración. */
export function getMinsaludAccessToken() {
  return client.getAccessToken()
}

export function clearMinsaludTokenCache() {
  client.clearTokenCache()
}

/**
 * POST/GET al MUV con Authorization Bearer y el mismo material TLS del login.
 * Un 401 invalida la caché y reintenta una vez con un token nuevo.
 *
 * @param {object} options
 * @param {string} options.url
 * @param {string} [options.method]
 * @param {Record<string, string>} [options.headers]
 * @param {string} [options.body]
 * @param {number} [options.timeoutMs]
 */
export function minsaludAuthorizedRequest(options) {
  return client.authorizedRequest(options)
}

/** Estado público, sin secretos ni token. */
export function describeMinsaludAuth() {
  const minsalud = config.minsalud
  return {
    sandbox: minsalud.sandbox,
    authMode: minsalud.authMode,
    credentialsConfigured: credentialsAreConfigured(minsalud),
    tlsClientCertificate: Boolean(minsalud.tls?.cert || minsalud.tls?.certPath),
    endpointConfigured: Boolean(minsalud.apiBaseUrl || minsalud.authUrl),
  }
}
