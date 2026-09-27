import { createHash } from 'node:crypto'

/** Renueva el token 2 minutos antes de que venza, para no usarlo a mitad de un envío. */
export const SISPRO_TOKEN_SKEW_MS = 120_000
/** Tope de vida en caché aunque el Ministerio entregue un JWT más largo. */
export const SISPRO_TOKEN_MAX_TTL_MS = 50 * 60 * 1000

/** @type {Map<string, { token: string, expiresAtMs: number }>} */
const cache = new Map()
/** @type {Map<string, Promise<string>>} */
const enVuelo = new Map()

function encodeBase64Url(value) {
  return Buffer.from(value).toString('base64url')
}

function readJwtExpMs(token) {
  const parts = String(token ?? '').split('.')
  if (parts.length < 2) return null
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString())
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null
  } catch {
    return null
  }
}

/**
 * Vencimiento efectivo del token en caché.
 * Usa `exp` del JWT, si no `expires_in`, y nunca supera el TTL máximo.
 * @param {string} token
 * @param {number | undefined} expiresInSeconds
 * @param {number} [now]
 * @returns {{ expiresAtMs: number, cacheable: boolean }}
 */
export function calcularVencimientoCache(token, expiresInSeconds, now = Date.now()) {
  const fromBody =
    Number.isFinite(Number(expiresInSeconds)) && Number(expiresInSeconds) > 0
      ? now + Number(expiresInSeconds) * 1000
      : null
  const absolute = readJwtExpMs(token) ?? fromBody ?? now + 60 * 60 * 1000
  const expiresAtMs = Math.min(absolute, now + SISPRO_TOKEN_MAX_TTL_MS)
  return {
    expiresAtMs,
    cacheable: expiresAtMs - now > SISPRO_TOKEN_SKEW_MS,
  }
}

/**
 * Acepta el prestador ya descifrado, en forma plana o en el cuerpo oficial de LoginSISPRO.
 * @param {object} input
 */
export function normalizarCredencialesDescifradas(input) {
  if (!input || typeof input !== 'object') {
    const error = new Error('Las credenciales descifradas del prestador son obligatorias.')
    error.status = 400
    throw error
  }

  const tipo = String(
    input.tipoDocumento ?? input.tipo ?? input.persona?.identificacion?.tipo ?? '',
  )
    .trim()
    .toUpperCase()
  const numero = String(
    input.numeroDocumento ??
      input.numero ??
      input.numDocumento ??
      input.persona?.identificacion?.numero ??
      '',
  ).trim()
  const clave = String(input.clave ?? input.password ?? '')
  const nit = String(input.nit ?? '').replace(/\D/g, '')
  const codPrestador = String(input.codPrestador ?? input.codPrestadorReps ?? '').replace(/\D/g, '')

  if (!tipo || !numero || !clave.trim() || !nit) {
    const error = new Error(
      'Credenciales SISPRO incompletas: tipo de documento, número, clave y NIT son obligatorios.',
    )
    error.status = 400
    throw error
  }

  return {
    tipo,
    numero,
    clave,
    nit,
    codPrestador: codPrestador || undefined,
    tipoPrestador: 'independiente',
  }
}

function cacheKey(credenciales) {
  return createHash('sha256')
    .update(`${credenciales.nit}|${credenciales.tipo}|${credenciales.numero}|${credenciales.clave}`)
    .digest('hex')
}

function leerCache(key) {
  const entry = cache.get(key)
  if (!entry) return null
  if (Date.now() >= entry.expiresAtMs - SISPRO_TOKEN_SKEW_MS) {
    cache.delete(key)
    return null
  }
  return entry.token
}

function guardarCache(key, token, expiresInSeconds) {
  const { expiresAtMs, cacheable } = calcularVencimientoCache(token, expiresInSeconds)
  if (!cacheable) return token
  cache.set(key, { token, expiresAtMs })
  return token
}

export function crearTokenSandbox(credenciales) {
  const now = Math.floor(Date.now() / 1000)
  const claims = {
    sub: credenciales.numero,
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

/**
 * Reutiliza el JWT mientras el TTL siga vigente. `producer` hace el POST al MUV.
 * @param {object} credencialesDescifradas
 * @param {(credenciales: object) => Promise<{ token: string, expiresIn?: number }>} producer
 */
export async function withCachedSisproToken(credencialesDescifradas, producer) {
  const credenciales = normalizarCredencialesDescifradas(credencialesDescifradas)
  const key = cacheKey(credenciales)
  const cached = leerCache(key)
  if (cached) return cached

  const pending = enVuelo.get(key)
  if (pending) return pending

  const request = Promise.resolve()
    .then(() => producer(credenciales))
    .then(({ token, expiresIn }) => guardarCache(key, token, expiresIn))
    .finally(() => {
      enVuelo.delete(key)
    })

  enVuelo.set(key, request)
  return request
}

/**
 * POST /api/Auth/LoginSISPRO con las credenciales descifradas del prestador.
 * @param {object} credencialesDescifradas
 * @returns {Promise<string>}
 */
export async function obtenerBearerToken(credencialesDescifradas) {
  const { minSaludAuth } = await import('./MinSaludAuthService.js')
  return minSaludAuth.obtenerToken(credencialesDescifradas)
}

export function invalidarCacheSispro(credencialesDescifradas) {
  if (!credencialesDescifradas) {
    cache.clear()
    return
  }
  try {
    cache.delete(cacheKey(normalizarCredencialesDescifradas(credencialesDescifradas)))
  } catch {
    cache.clear()
  }
}
