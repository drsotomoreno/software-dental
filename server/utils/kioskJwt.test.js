import assert from 'node:assert/strict'
import test from 'node:test'
import { signKioskToken, verifyKioskToken } from './kioskJwt.js'

const SECRET = 'unit-test-kiosk-secret'

test('signKioskToken emite role=kiosk y clinicId', () => {
  const token = signKioskToken({ clinicId: 'clinic:demo', expiresInSec: 120 }, SECRET)
  const claims = verifyKioskToken(token, SECRET)
  assert.equal(claims.role, 'kiosk')
  assert.equal(claims.clinicId, 'clinic:demo')
})

test('verifyKioskToken rechaza firma alterada', () => {
  const token = signKioskToken({ clinicId: 'clinic:demo' }, SECRET)
  const tampered = `${token.slice(0, -4)}xxxx`
  assert.throws(() => verifyKioskToken(tampered, SECRET), /inválido/i)
})

test('verifyKioskToken rechaza token expirado', () => {
  const token = signKioskToken({ clinicId: 'clinic:demo', expiresInSec: -10 }, SECRET)
  assert.throws(() => verifyKioskToken(token, SECRET), /expirado/i)
})
