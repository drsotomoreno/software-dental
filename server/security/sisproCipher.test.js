import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import test from 'node:test'
import {
  decryptSecret,
  encryptSecret,
  loadEncryptionKey,
} from './sisproCipher.js'

const key = randomBytes(32)

test('la llave debe ser base64 de 32 bytes', () => {
  assert.throws(
    () => loadEncryptionKey({}),
    /SISPRO_ENCRYPTION_KEY es obligatoria/,
  )
  assert.throws(
    () => loadEncryptionKey({ SISPRO_ENCRYPTION_KEY: Buffer.from('corta').toString('base64') }),
    /32 bytes/,
  )
  assert.equal(loadEncryptionKey({ SISPRO_ENCRYPTION_KEY: key.toString('base64') }).equals(key), true)
})

test('AES-256-GCM recupera el secreto y no lo deja en claro', () => {
  const secret = 'clave-sispro-unica-9f3a'
  const blob = encryptSecret(secret, key)

  assert.equal(blob[0], 1)
  assert.equal(blob.length > 1 + 12 + 16, true)
  assert.equal(blob.includes(Buffer.from(secret)), false)
  assert.equal(decryptSecret(blob, key), secret)
  assert.equal(encryptSecret(secret, key).equals(blob), false)
})

test('un tag alterado no se descifra', () => {
  const blob = encryptSecret('secreto-sispro', key)
  const tampered = Buffer.from(blob)
  tampered[1 + 12] ^= 0xff

  assert.throws(() => decryptSecret(tampered, key), /tag inválido o llave incorrecta/)
})
