import assert from 'node:assert/strict'
import test from 'node:test'
import { issueMasterSessionFallback, MASTER_EMAIL } from './subscriptionAuthStore.js'

test('la sesión de respaldo del superadmin no consulta la base', () => {
  const result = issueMasterSessionFallback()
  assert.equal(result.ok, true)
  assert.equal(result.user.email, MASTER_EMAIL)
  assert.equal(result.user.rol, 'superadmin')
  assert.equal(result.user.estado_pago, 'exento')
  assert.ok(String(result.token).startsWith('superadmin-local-'))
})
