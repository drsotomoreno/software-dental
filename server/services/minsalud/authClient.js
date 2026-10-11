import { readFileSync } from 'node:fs'
import {
  MinsaludAuthError,
  MinsaludAuthForbiddenError,
  MinsaludAuthInvalidResponseError,
  MinsaludAuthNetworkError,
  MinsaludAuthUnauthorizedError,
  MinsaludAuthUpstreamError,
} from './errors.js'
import {
  buildAuthRequest,
  definitiveCredentialRejection,
  expiryFromLogin,
  loginRejected,
  messageFromPayload,
  tokenFromPayload,
} from './login.js'
import { redactSecrets, sanitizeDetails } from './redact.js'
import { attemptsAllowed, backoffDelayMs } from './retry.js'
import { createTlsAgent } from './tls.js'
import { minsaludRequest } from './transport.js'

/**
 * @typedef {object} TokenSession
 * @property {string} accessToken
 * @property {number} expiresAt
 */

/**
 * @param {string | string[] | undefined} header
 */
function retryAfterMs(header) {
  const value = Array.isArray(header) ? header[0] : header
  if (!value) return undefined
  const seconds = Number(value)
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000
  const date = Date.parse(value)
  if (Number.isNaN(date)) return undefined
  return Math.max(0, date - Date.now())
}

/**
 * @param {string} text
 */
function parsePayload(text) {
  if (!text || !text.trim()) return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

/**
 * Cliente LoginSISPRO / client_credentials con caché de Bearer Token.
 * La renovación ocurre `tokenSkewMs` antes de `exp` y las llamadas
 * concurrentes comparten una sola petición de login.
 */
export function createMinsaludAuthClient(options = {}) {
  const getConfig = options.getConfig
  const request = options.request ?? minsaludRequest
  const now = options.now ?? Date.now
  const sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)))
  const setTimer = options.setTimer ?? ((fn, ms) => setTimeout(fn, ms))
  const clearTimer = options.clearTimer ?? ((timer) => clearTimeout(timer))
  const random = options.random ?? Math.random
  const autoRenew = options.autoRenew ?? false
  const readFile = options.readFile ?? ((path) => readFileSync(path, 'utf8'))

  /** @type {TokenSession | null} */
  let session = null
  /** @type {Promise<TokenSession> | null} */
  let inflight = null
  let generation = 0
  let timer = null
  /** @type {import('node:https').Agent | null | undefined} */
  let agent
  let agentKey = ''

  function secrets() {
    const cfg = getConfig()
    return [cfg.clave, cfg.clientSecret, cfg.tls.passphrase, session?.accessToken].filter(Boolean)
  }

  function armRenewal(next) {
    if (timer) clearTimer(timer)
    timer = null
    if (!autoRenew) return
    const delay = Math.max(0, next.expiresAt - getConfig().tokenSkewMs - now())
    const scheduledGeneration = generation
    timer = setTimer(() => {
      timer = null
      if (scheduledGeneration !== generation) return undefined
      return renewQuietly()
    }, delay)
    timer?.unref?.()
  }

  function store(next, storeGeneration) {
    if (storeGeneration !== generation) return
    session = next
    armRenewal(next)
  }

  async function renewQuietly() {
    try {
      await loginSingleFlight()
    } catch (error) {
      if (!session) return
      if (error instanceof MinsaludAuthUnauthorizedError && !error.retryable) return
      if (error instanceof MinsaludAuthForbiddenError) return
      if (!(error instanceof MinsaludAuthError) || !error.retryable) return
      const cfg = getConfig()
      const delay = Math.min(
        error.retryAfterMs ?? backoffDelayMs(1, { baseMs: cfg.retryBaseMs, maxMs: cfg.retryMaxMs, random }),
        cfg.retryMaxMs,
      )
      const scheduledGeneration = generation
      timer = setTimer(() => {
        timer = null
        if (scheduledGeneration !== generation) return
        void renewQuietly()
      }, delay)
      timer?.unref?.()
    }
  }

  function currentAgent() {
    const tls = getConfig().tls
    const key = [
      tls.certPath,
      tls.keyPath,
      tls.caPath,
      tls.rejectUnauthorized,
      Boolean(tls.cert),
      Boolean(tls.key),
      Boolean(tls.ca),
    ].join('|')
    if (agentKey === key && agent !== undefined) return agent
    agent = createTlsAgent(tls, readFile)
    agentKey = key
    return agent
  }

  /**
   * @param {{ status: number, headers: import('node:http').IncomingHttpHeaders, text: string }} response
   */
  function classify(response) {
    const payload = parsePayload(response.text)
    const hidden = secrets()
    const details = sanitizeDetails(payload ?? response.text, hidden)
    const ministryMessage = redactSecrets(messageFromPayload(payload), hidden)
    const retryAfter = retryAfterMs(response.headers?.['retry-after'])

    if (response.status === 401 || (response.status === 200 && loginRejected(payload))) {
      const definitive = definitiveCredentialRejection(payload) || response.status === 200
      return new MinsaludAuthUnauthorizedError(
        ministryMessage || 'El Ministerio de Salud rechazó las credenciales SISPRO.',
        { retryable: response.status === 401 && !definitive, details, httpStatus: 401 },
      )
    }

    if (response.status === 403) {
      const ambiguous = payload === null && !ministryMessage
      return new MinsaludAuthForbiddenError(
        ministryMessage || 'El Ministerio de Salud denegó el acceso (403). Revise el rol y el NIT del prestador.',
        { details, retryable: ambiguous },
      )
    }

    if (response.status === 429 || response.status >= 500) {
      return new MinsaludAuthUpstreamError(
        ministryMessage || `El servicio de autenticación del Ministerio de Salud respondió ${response.status}.`,
        { httpStatus: response.status, details, retryAfterMs: retryAfter, retryable: true },
      )
    }

    if (response.status >= 400) {
      return new MinsaludAuthInvalidResponseError(
        ministryMessage || `LoginSISPRO rechazó la solicitud (${response.status}).`,
        { httpStatus: response.status, details, retryable: false },
      )
    }

    const token = tokenFromPayload(payload ?? response.text)
    if (!token) {
      const unstructured = payload === null
      return new MinsaludAuthInvalidResponseError(
        'LoginSISPRO no devolvió Bearer Token.',
        { httpStatus: response.status, details, retryable: unstructured },
      )
    }

    return {
      accessToken: token,
      expiresAt: expiryFromLogin(payload, token, now(), getConfig().tokenTtlSeconds),
    }
  }

  async function loginOnce() {
    const cfg = getConfig()
    const prepared = buildAuthRequest(cfg)
    let response
    try {
      response = await request({
        ...prepared,
        agent: currentAgent(),
        timeoutMs: cfg.timeoutMs,
      })
    } catch (error) {
      if (error instanceof MinsaludAuthError) throw error
      const timedOut = error?.name === 'TimeoutError' || error?.code === 'ETIMEDOUT'
      throw new MinsaludAuthNetworkError(
        timedOut
          ? 'Tiempo de espera agotado al autenticar contra el Ministerio de Salud.'
          : 'No hubo conexión con el servicio de autenticación del Ministerio de Salud.',
        error,
      )
    }
    const result = classify(response)
    if (result instanceof MinsaludAuthError) throw result
    return result
  }

  async function loginWithRetry() {
    const cfg = getConfig()
    /** @type {MinsaludAuthError | null} */
    let lastError = null
    for (let attempt = 1; attempt <= cfg.maxAttempts; attempt += 1) {
      try {
        return await loginOnce()
      } catch (error) {
        const wrapped = error instanceof MinsaludAuthError
          ? error
          : new MinsaludAuthNetworkError('Fallo de red al autenticar contra el Ministerio de Salud.', error)
        wrapped.attempt = attempt
        lastError = wrapped
        const allowed = attemptsAllowed(wrapped, cfg.maxAttempts)
        if (!wrapped.retryable || attempt >= allowed) throw wrapped
        const delay = wrapped.retryAfterMs
          ? Math.min(wrapped.retryAfterMs, cfg.retryMaxMs)
          : backoffDelayMs(attempt, { baseMs: cfg.retryBaseMs, maxMs: cfg.retryMaxMs, random })
        await sleep(delay)
      }
    }
    throw lastError ?? new MinsaludAuthUpstreamError('No se obtuvo token del Ministerio de Salud.')
  }

  function loginSingleFlight() {
    if (inflight) return inflight
    const storeGeneration = generation
    const promise = loginWithRetry()
      .then((next) => {
        store(next, storeGeneration)
        return next
      })
      .finally(() => {
        if (inflight === promise) inflight = null
      })
    inflight = promise
    return promise
  }

  function freshToken() {
    if (!session) return ''
    if (now() < session.expiresAt - getConfig().tokenSkewMs) return session.accessToken
    return ''
  }

  function usableToken() {
    if (!session) return ''
    if (now() < session.expiresAt) return session.accessToken
    return ''
  }

  async function getAccessToken() {
    const cached = freshToken()
    if (cached) return cached
    try {
      const next = await loginSingleFlight()
      return next.accessToken
    } catch (error) {
      const fallback = usableToken()
      if (fallback) return fallback
      throw error
    }
  }

  function clearTokenCache() {
    generation += 1
    session = null
    inflight = null
    if (timer) clearTimer(timer)
    timer = null
  }

  /**
   * @param {object} options
   * @param {string} options.url
   * @param {string} [options.method]
   * @param {Record<string, string>} [options.headers]
   * @param {string} [options.body]
   * @param {number} [options.timeoutMs]
   */
  async function authorizedRequest(requestOptions) {
    const send = (token) => request({
      url: requestOptions.url,
      method: requestOptions.method ?? 'POST',
      headers: {
        ...requestOptions.headers,
        Authorization: `Bearer ${token}`,
      },
      body: requestOptions.body,
      timeoutMs: requestOptions.timeoutMs,
      agent: currentAgent(),
    })

    let token = await getAccessToken()
    let response = await send(token)
    if (response.status === 401) {
      clearTokenCache()
      token = await getAccessToken()
      response = await send(token)
    }
    return response
  }

  return {
    getAccessToken,
    clearTokenCache,
    authorizedRequest,
  }
}
