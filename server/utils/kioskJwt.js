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
  const value = String(secret || config.kioskJwtSecret || '').trim()
  if (!value) {
    const error = new Error('KIOSK_JWT_SECRET no está configurado.')
    error.code = 'KIOSK_JWT_MISCONFIGURED'
    throw error
  }
  return value
}

/**
 * Emite un JWT HS256 de kiosco.
 * @param {{ clinicId: string, expiresInSec?: number }} params
 */
export function signKioskToken({ clinicId, expiresInSec = 60 * 60 * 8 }, secret = config.kioskJwtSecret) {
  const clinic = String(clinicId || '').trim()
  if (!clinic) {
    const error = new Error('clinicId es requerido para firmar el token de kiosco.')
    error.status = 400
    throw error
  }
  const header = b64urlJson({ alg: 'HS256', typ: 'JWT' })
  const now = Math.floor(Date.now() / 1000)
  const ttlSec = expiresInSec == null ? 28800 : Number(expiresInSec)
  const payload = b64urlJson({
    role: 'kiosk',
    clinicId: clinic,
    iat: now,
    exp: now + (Number.isFinite(ttlSec) ? Math.trunc(ttlSec) : 28800),
  })
  const data = `${header}.${payload}`
  const sig = createHmac('sha256', resolveSecret(secret)).update(data).digest('base64url')
  return `${data}.${sig}`
}

/**
 * Verifica firma, expiración y estructura mínima del JWT de kiosco.
 * @returns {{ role: string, clinicId: string, exp?: number, iat?: number }}
 */
export function verifyKioskToken(token, secret = config.kioskJwtSecret) {
  const raw = String(token || '').trim()
  const parts = raw.split('.')
  if (parts.length !== 3) {
    const error = new Error('Token de kiosco inválido.')
    error.status = 401
    error.code = 'KIOSK_TOKEN_MALFORMED'
    throw error
  }

  const [headerB64, payloadB64, signature] = parts
  const data = `${headerB64}.${payloadB64}`
  const expected = createHmac('sha256', resolveSecret(secret)).update(data).digest('base64url')
  if (!safeEqual(expected, signature)) {
    const error = new Error('Token de kiosco inválido.')
    error.status = 401
    error.code = 'KIOSK_TOKEN_BAD_SIGNATURE'
    throw error
  }

  let payload
  try {
    payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'))
  } catch {
    const error = new Error('Token de kiosco inválido.')
    error.status = 401
    error.code = 'KIOSK_TOKEN_BAD_PAYLOAD'
    throw error
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    const error = new Error('Token de kiosco inválido.')
    error.status = 401
    throw error
  }

  if (payload.exp != null && Number(payload.exp) * 1000 <= Date.now()) {
    const error = new Error('Token de kiosco expirado.')
    error.status = 401
    error.code = 'KIOSK_TOKEN_EXPIRED'
    throw error
  }

  const clinicId = String(payload.clinicId || payload.clinic_id || '').trim()
  const role = String(payload.role || '').trim()

  return {
    ...payload,
    role,
    clinicId,
  }
}
