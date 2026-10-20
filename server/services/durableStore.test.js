import assert from 'node:assert/strict'
import test from 'node:test'
import { mergeDurableStores, poolConfig } from './durableStore.js'

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

test('la URL externa de Render usa SSL sin verificar la CA', () => {
  const config = poolConfig(
    'postgresql://user:secret@dpg-abc123-a.oregon-postgres.render.com:5432/mydb?sslmode=require',
  )
  assert.deepEqual(config.ssl, { rejectUnauthorized: false })
  assert.equal(config.query_timeout, 8_000)
  assert.equal(config.host, 'dpg-abc123-a.oregon-postgres.render.com')
  assert.equal(config.port, 5432)
  assert.equal(config.database, 'mydb')
  assert.equal(config.connectionString, undefined)
})

test('el host interno de Render y localhost no fuerzan TLS', () => {
  assert.equal(poolConfig('postgresql://user:secret@dpg-abc123-a/mydb').ssl, false)
  assert.equal(
    poolConfig('postgresql://postgres:postgres@localhost:5432/software_dental').ssl,
    false,
  )
})

test('una contraseña con % no apaga el SSL de la base externa', () => {
  const config = poolConfig(
    'postgresql://user:100%@dpg-abc123-a.oregon-postgres.render.com/mydb',
  )
  assert.deepEqual(config.ssl, { rejectUnauthorized: false })
  assert.equal(config.password, '100%')
  assert.equal(config.connectionString, undefined)
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
