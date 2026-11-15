import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

function sliceFunction(source, name) {
  const start = source.indexOf(`export async function ${name}`)
  assert.notEqual(start, -1, `falta ${name}`)
  const next = source.indexOf('\nexport ', start + 10)
  return source.slice(start, next === -1 ? source.length : next)
}

test('eliminar un registro invalida la cuenta y no borra el cubo clínico', async () => {
  const src = await readFile(join(here, 'subscriptionAuthStore.js'), 'utf8')
  const fn = sliceFunction(src, 'deleteSubscriptionUserByEmail')
  assert.match(fn, /La cuenta del superadministrador no puede eliminarse/)
  assert.match(fn, /forgetLiveSessionsForUser\(removed\.id\)/)
  assert.match(fn, /deletedAccounts/)
  assert.match(fn, /No se pudo guardar la eliminación/)
  assert.match(fn, /store\.sessions/)
  assert.match(fn, /store\.passwordResets/)
  assert.match(fn, /deleteEmailOtp\(normalizedEmail\)/)
  assert.match(fn, /releaseRethusClaimsForUser\(removed\.id\)/)
  assert.match(fn, /releasePrestadorLinksForUser\(removed\.id\)/)
  assert.match(fn, /DELETE FROM usuarios/)
  assert.match(fn, /is_superadmin, FALSE/)
  assert.doesNotMatch(fn, /resetClinicClinicalBucket/)
  assert.match(sliceFunction(src, 'subscriptionAccountExists'), /store\.users\.some/)
})

test('un JWT de una cuenta eliminada no pasa verificarToken', async () => {
  const src = await readFile(join(here, '../middleware/tenantAuth.middleware.js'), 'utf8')
  assert.match(src, /subscriptionAccountExists\(decoded\.id\)/)
  assert.match(src, /ACCOUNT_REMOVED/)
  assert.match(src, /La cuenta fue eliminada/)
})
