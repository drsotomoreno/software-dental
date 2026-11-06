import { createHmac, timingSafeEqual } from 'node:crypto'
import { config } from '../config.js'

function b64urlJson(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url')
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a))
  const right = Buffer.from(String(b))
  if (left.length !== right.length) return false
  return timingSafeEqual(left, right)
}

function resolveSecret(secret) {
  const value = String(secret || config.jwtSecret || '').trim()
  if (!value) {
    const error = new Error('JWT_SECRET no está configurado.')
    error.code = 'JWT_MISCONFIGURED'
    throw error
  }
  return value
}

export function isLikelyJwt(token) {
  const parts = String(token || '').trim().split('.')
  return parts.length === 3 && parts.every((part) => part.length > 0)
}

/**
 * Emite JWT HS256 de sesión de la app.
 * Claims: { id, clinica_id, is_superadmin, rol, sid? }
 */
export function signSessionToken(
  { id, clinica_id = null, is_superadmin = false, rol = 'odontologo', sid = null },
  { expiresInSec = 60 * 60 * 24 * 30, secret = config.jwtSecret } = {},
) {
  const userId = String(id || '').trim()
  if (!userId) {
    const error = new Error('id es requerido para firmar el token de sesión.')
    error.status = 400
    throw error
  }

  const header = b64urlJson({ alg: 'HS256', typ: 'JWT' })
  const now = Math.floor(Date.now() / 1000)
  const ttl = Number(expiresInSec)
  const payload = {
    id: userId,
    clinica_id: clinica_id == null || clinica_id === '' ? null : String(clinica_id),
    is_superadmin: Boolean(is_superadmin),
    rol: String(rol || 'odontologo'),
    iat: now,
    exp: now + (Number.isFinite(ttl) ? Math.trunc(ttl) : 60 * 60 * 24 * 30),
  }
  if (sid) payload.sid = String(sid)

  const body = b64urlJson(payload)
  const data = `${header}.${body}`
  const sig = createHmac('sha256', resolveSecret(secret)).update(data).digest('base64url')
  return `${data}.${sig}`
}

/**
 * Verifica firma y expiración del JWT de sesión.
 * @returns {{ id: string, clinica_id: string|null, is_superadmin: boolean, rol: string, sid?: string }}
 */
export function verifySessionToken(token, secret = config.jwtSecret) {
  const raw = String(token || '').trim()
  const parts = raw.split('.')
  if (parts.length !== 3) {
    const error = new Error('Token inválido o expirado.')
    error.status = 401
    error.code = 'JWT_MALFORMED'
    throw error
  }

  const [headerB64, payloadB64, signature] = parts
  const data = `${headerB64}.${payloadB64}`
  const expected = createHmac('sha256', resolveSecret(secret)).update(data).digest('base64url')
  if (!safeEqual(expected, signature)) {
    const error = new Error('Token inválido o expirado.')
    error.status = 401
    error.code = 'JWT_BAD_SIGNATURE'
    throw error
  }

  let payload
  try {
    payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'))
  } catch {
    const error = new Error('Token inválido o expirado.')
    error.status = 401
    error.code = 'JWT_BAD_PAYLOAD'
    throw error
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    const error = new Error('Token inválido o expirado.')
    error.status = 401
    throw error
  }

  if (payload.exp != null && Number(payload.exp) * 1000 <= Date.now()) {
    const error = new Error('Token inválido o expirado.')
    error.status = 401
    error.code = 'JWT_EXPIRED'
    throw error
  }

  const id = String(payload.id || payload.userId || '').trim()
  if (!id) {
    const error = new Error('Token inválido o expirado.')
    error.status = 401
    error.code = 'JWT_MISSING_ID'
    throw error
  }

  return {
    ...payload,
    id,
    clinica_id:
      payload.clinica_id == null || payload.clinica_id === ''
        ? null
        : String(payload.clinica_id),
    is_superadmin: Boolean(payload.is_superadmin),
    rol: String(payload.rol || 'odontologo'),
    sid: payload.sid ? String(payload.sid) : undefined,
  }
}
