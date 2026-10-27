import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url))

test('el alta y /users/invite saltan el cupo sin ReTHUS o si el rol es assistant', async () => {
  const routes = await readFile(join(root, 'auth.routes.js'), 'utf8')
  const store = await readFile(join(root, '../services/subscriptionAuthStore.js'), 'utf8')
  assert.match(routes, /router\.post\('\/clinic\/users', inviteClinicUser\)/)
  assert.match(routes, /router\.post\('\/users\/invite', inviteClinicUser\)/)
  assert.match(store, /value === 'auxiliar' \|\| value === 'assistant'/)
  assert.match(store, /rethusNumber \?\? member\?\.rethus_code \?\? member\?\.rethusCode/)
  assert.match(store, /const administrative = isAuxiliar \|\| !rethusCode/)
  assert.match(store, /rethusLimitReachedMessage/)
  assert.match(store, /Usuario administrativo creado/)
  assert.match(store, /Profesional agregado correctamente/)
})
