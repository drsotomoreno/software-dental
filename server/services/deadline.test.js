import assert from 'node:assert/strict'
import test from 'node:test'
import { withDeadline } from './deadline.js'

test('resuelve si el trabajo termina a tiempo', async () => {
  const value = await withDeadline(async () => 'listo', 200)
  assert.equal(value, 'listo')
})

test('rechaza si el trabajo no termina', async () => {
  await assert.rejects(
    () => withDeadline(() => new Promise(() => {}), 30),
    (error) => error instanceof Error && error.code === 'DEADLINE',
  )
})
