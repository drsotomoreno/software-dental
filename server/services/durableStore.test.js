import assert from 'node:assert/strict'
import test from 'node:test'
import { mergeDurableStores } from './durableStore.js'

const CEDULA = '52333444'
const OTRA = '1099887766'

test('una copia más nueva sin cédula no borra la que ya estaba guardada', () => {
  const merged = mergeDurableStores(
    {
      users: [
        {
          id: '1',
          email: 'a@b.co',
          documentNumber: '',
          rethusNumber: '',
          updatedAt: '2026-10-11T18:00:00.000Z',
        },
      ],
    },
    {
      users: [
        {
          id: '1',
          email: 'a@b.co',
          documentType: 'CC',
          documentNumber: CEDULA,
          rethusNumber: '12345678',
          updatedAt: '2026-10-01T00:00:00.000Z',
        },
      ],
    },
    { primaryUserWins: true },
  )
  assert.equal(merged.users[0].documentNumber, CEDULA)
  assert.equal(merged.users[0].documentType, 'CC')
  assert.equal(merged.users[0].rethusNumber, '12345678')
})

test('una cédula nueva reemplaza la anterior', () => {
  const merged = mergeDurableStores(
    {
      users: [{ id: '1', documentNumber: OTRA, updatedAt: '2026-10-11T18:00:00.000Z' }],
    },
    {
      users: [{ id: '1', documentNumber: CEDULA, updatedAt: '2026-10-01T00:00:00.000Z' }],
    },
    { primaryUserWins: true },
  )
  assert.equal(merged.users[0].documentNumber, OTRA)
})
