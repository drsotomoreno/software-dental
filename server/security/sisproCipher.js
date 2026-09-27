import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

/** AES-256-GCM. El tag autentica el ciphertext en reposo. */
export const SISPRO_ENCRYPTION_ALGORITHM = 'AES-256-GCM'
export const SISPRO_ENCRYPTION_KEY_VERSION = 1

const NODE_ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12
const TAG_LENGTH = 16
const FORMAT_VERSION = 1
const HEADER_LENGTH = 1 + IV_LENGTH + TAG_LENGTH

/**
 * Llave de 32 bytes, solo desde SISPRO_ENCRYPTION_KEY (base64).
 * No se persiste en la base ni en el repositorio.
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {Buffer}
 */
export function loadEncryptionKey(env = process.env) {
  const raw = env.SISPRO_ENCRYPTION_KEY
  if (raw == null || String(raw).trim() === '') {
    throw new Error('SISPRO_ENCRYPTION_KEY es obligatoria para cifrar credenciales SISPRO.')
  }

  const key = Buffer.from(String(raw).trim(), 'base64')
  if (key.length !== 32) {
    throw new Error('SISPRO_ENCRYPTION_KEY debe decodificar a exactamente 32 bytes (AES-256).')
  }
  return key
}

/**
 * Empaqueta versión (1) + IV (12) + tag (16) + ciphertext.
 * @param {string} plaintext
 * @param {Buffer} [key]
 * @returns {Buffer}
 */
export function encryptSecret(plaintext, key = loadEncryptionKey()) {
  if (plaintext == null || String(plaintext) === '') {
    throw new Error('No se cifra un secreto vacío.')
  }
  if (!Buffer.isBuffer(key) || key.length !== 32) {
    throw new Error('La llave de cifrado SISPRO debe medir 32 bytes.')
  }

  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(NODE_ALGORITHM, key, iv)
  const ciphertext = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  if (tag.length !== TAG_LENGTH) {
    throw new Error('Tag de autenticación AES-256-GCM inválido.')
  }

  return Buffer.concat([Buffer.from([FORMAT_VERSION]), iv, tag, ciphertext])
}

/**
 * @param {Buffer | Uint8Array} blob
 * @param {Buffer} [key]
 * @returns {string}
 */
export function decryptSecret(blob, key = loadEncryptionKey()) {
  if (!Buffer.isBuffer(key) || key.length !== 32) {
    throw new Error('La llave de cifrado SISPRO debe medir 32 bytes.')
  }

  const buffer = Buffer.isBuffer(blob) ? blob : Buffer.from(blob)
  if (buffer.length <= HEADER_LENGTH) {
    throw new Error('Blob de credencial SISPRO inválido.')
  }
  if (buffer[0] !== FORMAT_VERSION) {
    throw new Error('Versión de cifrado SISPRO no soportada.')
  }

  const iv = buffer.subarray(1, 1 + IV_LENGTH)
  const tag = buffer.subarray(1 + IV_LENGTH, HEADER_LENGTH)
  const ciphertext = buffer.subarray(HEADER_LENGTH)
  const decipher = createDecipheriv(NODE_ALGORITHM, key, iv)
  decipher.setAuthTag(tag)

  try {
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
  } catch {
    throw new Error('No se pudo descifrar la credencial SISPRO (tag inválido o llave incorrecta).')
  }
}
