import assert from 'node:assert/strict'
import test from 'node:test'
import { isRemoteDraftNewer } from './clinicalDraftMerge.ts'

test('el remoto más nuevo reemplaza al borrador local', () => {
  assert.equal(
    isRemoteDraftNewer('2026-10-22T15:00:00.000Z', '2026-10-22T15:00:01.000Z'),
    true,
  )
})

test('un borrador local más nuevo no se pisa con la copia del servidor', () => {
  assert.equal(
    isRemoteDraftNewer('2026-10-22T15:05:00.000Z', '2026-10-22T15:00:00.000Z'),
    false,
  )
})

test('la misma fecha conserva el borrador local', () => {
  const stamp = '2026-10-22T15:00:00.000Z'
  assert.equal(isRemoteDraftNewer(stamp, stamp), false)
})

test('sin fecha local, un remoto con fecha sí se aplica', () => {
  assert.equal(isRemoteDraftNewer(undefined, '2026-10-22T15:00:00.000Z'), true)
  assert.equal(isRemoteDraftNewer('', '2026-10-22T15:00:00.000Z'), true)
})

test('un remoto sin fecha no pisa un borrador local fechado', () => {
  assert.equal(isRemoteDraftNewer('2026-10-22T15:00:00.000Z', undefined), false)
  assert.equal(isRemoteDraftNewer('2026-10-22T15:00:00.000Z', 'no-es-fecha'), false)
})
