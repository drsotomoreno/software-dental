import assert from 'node:assert/strict'
import test from 'node:test'
import {
  mergeDurableStores,
  poolConfig,
  stripSslModeFromConnectionString,
} from './durableStore.js'

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

test('stripSslModeFromConnectionString elimina sslmode conflictivo', () => {
  const cleaned = stripSslModeFromConnectionString(
    'postgresql://user:secret@mydb.xxxxx.us-east-1.rds.amazonaws.com:5432/app?sslmode=require',
  )
  assert.equal(cleaned.includes('sslmode'), false)
  assert.match(cleaned, /rds\.amazonaws\.com/)
})

test('URL remota RDS usa connectionString limpio + SSL + timeout corto 3s + max 10', () => {
  const config = poolConfig(
    'postgresql://user:secret@mydb.xxxxx.us-east-1.rds.amazonaws.com:5432/mydb?sslmode=require',
  )
  assert.deepEqual(config.ssl, { rejectUnauthorized: false })
  assert.equal(config.max, 10)
  assert.equal(config.connectionTimeoutMillis, 3_000)
  assert.equal(config.idleTimeoutMillis, 30_000)
  assert.equal(typeof config.connectionString, 'string')
  assert.equal(String(config.connectionString).includes('sslmode'), false)
  assert.equal(config.host, undefined)
})

test('URL externa legacy (Render) también usa connectionString limpio + SSL', () => {
  const config = poolConfig(
    'postgresql://user:secret@dpg-abc123-a.oregon-postgres.render.com:5432/mydb?sslmode=require',
  )
  assert.deepEqual(config.ssl, { rejectUnauthorized: false })
  assert.equal(config.max, 10)
  assert.equal(String(config.connectionString).includes('sslmode'), false)
})

test('el host interno y localhost no fuerzan TLS', () => {
  assert.equal(poolConfig('postgresql://user:secret@dpg-abc123-a/mydb').ssl, false)
  assert.equal(
    poolConfig('postgresql://postgres:postgres@localhost:5432/software_dental').ssl,
    false,
  )
})

test('una contraseña con % no apaga el SSL de la base externa', () => {
  const config = poolConfig(
    'postgresql://user:100%@mydb.xxxxx.us-east-1.rds.amazonaws.com/mydb?sslmode=require',
  )
  assert.deepEqual(config.ssl, { rejectUnauthorized: false })
  assert.equal(typeof config.connectionString, 'string')
  assert.match(String(config.connectionString), /100%25|100%/)
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

test('los OTP de registro se fusionan por email (no por tokenHash)', () => {
  const pending = {
    email: 'delassostore@gmail.com',
    code: '259519',
    codeHash: 'abc',
    createdAt: '2026-11-09T19:00:00.000Z',
    expiresAt: '2026-11-09T19:15:00.000Z',
  }
  const merged = mergeDurableStores(
    { emailVerifications: [pending] },
    { emailVerifications: [] },
  )
  assert.equal(merged.emailVerifications.length, 1)
  assert.equal(merged.emailVerifications[0].email, 'delassostore@gmail.com')
  assert.equal(merged.emailVerifications[0].code, '259519')
})

test('un save concurrente con lista vacía no borra OTP pendientes', () => {
  const pending = {
    email: 'delassostore@gmail.com',
    code: '020822',
    codeHash: 'def',
    createdAt: '2026-11-09T19:00:00.000Z',
    expiresAt: '2026-11-09T19:15:00.000Z',
  }
  const merged = mergeDurableStores(
    { emailVerifications: [] },
    { emailVerifications: [pending] },
    { primaryUserWins: true },
  )
  assert.equal(merged.emailVerifications.length, 1)
  assert.equal(merged.emailVerifications[0].code, '020822')
})

test('en lectura, el OTP más reciente del mismo correo gana', () => {
  const older = {
    email: 'delassostore@gmail.com',
    code: '259519',
    createdAt: '2026-11-09T19:00:00.000Z',
  }
  const newer = {
    email: 'delassostore@gmail.com',
    code: '413204',
    createdAt: '2026-11-09T19:05:00.000Z',
  }
  const merged = mergeDurableStores(
    { emailVerifications: [newer] },
    { emailVerifications: [older] },
  )
  assert.equal(merged.emailVerifications.length, 1)
  assert.equal(merged.emailVerifications[0].code, '413204')
})
