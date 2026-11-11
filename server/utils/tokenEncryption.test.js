import assert from 'node:assert/strict'
import test from 'node:test'
import { decryptSecret, encryptSecret, secretsEqual } from './tokenEncryption.js'

const KEY = 'test-google-token-key-32chars!!'

test('encryptSecret / decryptSecret redondean el refresh_token', () => {
  const plain = '1//0gREFRESH_TOKEN_EXAMPLE_xyz'
  const packed = encryptSecret(plain, KEY)
  assert.match(packed, /^v1:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+$/)
  assert.equal(decryptSecret(packed, KEY), plain)
})

test('el mismo plaintext produce ciphertext distinto (IV aleatorio)', () => {
  const a = encryptSecret('same-token', KEY)
  const b = encryptSecret('same-token', KEY)
  assert.notEqual(a, b)
  assert.equal(decryptSecret(a, KEY), decryptSecret(b, KEY))
})

test('falla sin GOOGLE_TOKEN_ENCRYPTION_KEY', () => {
  assert.throws(() => encryptSecret('x', ''), { code: 'MISSING_TOKEN_ENCRYPTION_KEY' })
})

test('secretsEqual compara en claro', () => {
  assert.equal(secretsEqual('abc', 'abc'), true)
  assert.equal(secretsEqual('abc', 'abd'), false)
})
