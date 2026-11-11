/**
 * Cifrado en reposo para secretos de terceros (p. ej. Google refresh_token).
 * AES-256-GCM + clave derivada de GOOGLE_TOKEN_ENCRYPTION_KEY (SHA-256).
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'node:crypto'

const ALGO = 'aes-256-gcm'
const PREFIX = 'v1'

function resolveKeyMaterial(explicitKey) {
  const raw = String(explicitKey ?? process.env.GOOGLE_TOKEN_ENCRYPTION_KEY ?? '').trim()
  if (!raw) {
    const err = new Error(
      'Falta GOOGLE_TOKEN_ENCRYPTION_KEY. Defina una clave secreta (≥16 caracteres) en el entorno.',
    )
    err.code = 'MISSING_TOKEN_ENCRYPTION_KEY'
    throw err
  }
  if (raw.length < 16) {
    const err = new Error('GOOGLE_TOKEN_ENCRYPTION_KEY debe tener al menos 16 caracteres.')
    err.code = 'WEAK_TOKEN_ENCRYPTION_KEY'
    throw err
  }
  return createHash('sha256').update(raw, 'utf8').digest()
}

/** 32 bytes para AES-256. */
export function getTokenEncryptionKey(explicitKey) {
  return resolveKeyMaterial(explicitKey)
}

/**
 * @param {string} plaintext
 * @param {string} [explicitKey]
 * @returns {string} Formato `v1:{iv_b64url}:{tag_b64url}:{ciphertext_b64url}`
 */
export function encryptSecret(plaintext, explicitKey) {
  const text = String(plaintext ?? '')
  if (!text) {
    const err = new Error('No se puede cifrar un secreto vacío.')
    err.code = 'EMPTY_SECRET'
    throw err
  }
  const key = resolveKeyMaterial(explicitKey)
  const iv = randomBytes(12)
  const cipher = createCipheriv(ALGO, key, iv)
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [
    PREFIX,
    iv.toString('base64url'),
    tag.toString('base64url'),
    encrypted.toString('base64url'),
  ].join(':')
}

/**
 * @param {string} ciphertext
 * @param {string} [explicitKey]
 * @returns {string}
 */
export function decryptSecret(ciphertext, explicitKey) {
  const packed = String(ciphertext ?? '').trim()
  if (!packed) {
    const err = new Error('Ciphertext vacío.')
    err.code = 'EMPTY_CIPHERTEXT'
    throw err
  }
  const parts = packed.split(':')
  if (parts.length !== 4 || parts[0] !== PREFIX) {
    const err = new Error('Formato de secreto cifrado no reconocido.')
    err.code = 'INVALID_CIPHERTEXT_FORMAT'
    throw err
  }
  const [, ivB64, tagB64, dataB64] = parts
  const key = resolveKeyMaterial(explicitKey)
  const iv = Buffer.from(ivB64, 'base64url')
  const tag = Buffer.from(tagB64, 'base64url')
  const data = Buffer.from(dataB64, 'base64url')
  const decipher = createDecipheriv(ALGO, key, iv)
  decipher.setAuthTag(tag)
  try {
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')
  } catch {
    const err = new Error('No se pudo descifrar el secreto (clave o ciphertext inválidos).')
    err.code = 'DECRYPT_FAILED'
    throw err
  }
}

/** Comparación en tiempo constante de dos secretos en claro (p. ej. tests / nonce). */
export function secretsEqual(a, b) {
  const left = Buffer.from(String(a ?? ''), 'utf8')
  const right = Buffer.from(String(b ?? ''), 'utf8')
  if (left.length !== right.length) return false
  return timingSafeEqual(left, right)
}
