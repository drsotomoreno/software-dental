import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))

test('resolveSubscriptionSession no adopta Superadmin cuando falta el userId', async () => {
  const src = await readFile(join(here, 'subscriptionAuthStore.js'), 'utf8')
  assert.match(
    src,
    /NUNCA escalar una sesión huérfana a Superadmin/,
    'Debe documentar la política anti-escalada',
  )
  assert.doesNotMatch(
    src,
    /userIndex === -1\) \{\s*const superAdmin = findSuperAdminUser/,
    'No debe quedar el patrón de escalada a Superadmin por userIndex -1',
  )
  assert.match(
    src,
    /Sesión inválida: userId ausente/,
    'Debe invalidar la sesión huérfana en lugar de elevar privilegios',
  )
})
