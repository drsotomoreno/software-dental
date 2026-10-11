import assert from 'node:assert/strict'
import test from 'node:test'
import {
  MASTER_EMAIL,
  MASTER_PASSWORD,
  accountPasswordMatches,
  hashPasswordSha256,
} from './subscriptionAuthStore.js'

test('la clave con la que entra el titular sirve para firmar', () => {
  const account = { email: MASTER_EMAIL, passwordHash: hashPasswordSha256('otra-clave-local') }
  assert.equal(accountPasswordMatches(account, MASTER_PASSWORD), true)
  assert.equal(accountPasswordMatches(account, `${MASTER_PASSWORD} `), true)
})

test('otra cuenta no firma con la clave del titular', () => {
  const account = {
    email: 'otro@clinica.co',
    passwordHash: hashPasswordSha256('clave-propia-8'),
  }
  assert.equal(accountPasswordMatches(account, MASTER_PASSWORD), false)
  assert.equal(accountPasswordMatches(account, 'clave-propia-8'), true)
  assert.equal(accountPasswordMatches(account, 'clave-incorrecta'), false)
})
