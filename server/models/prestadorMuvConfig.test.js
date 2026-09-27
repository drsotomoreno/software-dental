import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import test from 'node:test'
import { createPrestadorMuvConfigModel } from './prestadorMuvConfig.js'

const key = randomBytes(32)

function withKey(fn) {
  const previous = process.env.SISPRO_ENCRYPTION_KEY
  process.env.SISPRO_ENCRYPTION_KEY = key.toString('base64')
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      if (previous === undefined) delete process.env.SISPRO_ENCRYPTION_KEY
      else process.env.SISPRO_ENCRYPTION_KEY = previous
    })
}

function memoryPrisma() {
  let stored = null
  return {
    stored: () => stored,
    prestadorMuvConfig: {
      findUnique: async () => stored,
      upsert: async ({ create, update }) => {
        const data = stored ? update : create
        stored = {
          id: 'row-1',
          createdAt: new Date(),
          updatedAt: new Date(),
          ...stored,
          ...data,
        }
        return stored
      },
    },
  }
}

test('upsert cifra la clave SISPRO y el DTO no la revela', async () => {
  await withKey(async () => {
    const prisma = memoryPrisma()
    const model = createPrestadorMuvConfigModel(prisma)
    const record = await model.upsertForPrestador('prestador-1', {
      repsCode: '6800103898-01',
      nit: '79904620-4',
      tipoDocumento: 'cc',
      credentials: {
        usuario: 'usuario-sispro',
        clave: 'clave-super-secreta',
      },
    })

    assert.equal(record.encryptionAlgorithm, 'AES-256-GCM')
    assert.equal(record.repsCode, '680010389801')
    assert.equal(record.sisproClaveCipher.includes(Buffer.from('clave-super-secreta')), false)
    assert.equal(record.sisproClientIdCipher, null)

    const safe = model.toSafeDto(record)
    assert.equal(JSON.stringify(safe).includes('clave-super-secreta'), false)
    assert.equal(safe.hasSisproUsuario, true)
    assert.equal(safe.hasSisproClave, true)
    assert.equal(safe.hasSisproClientSecret, false)
    assert.equal(model.getCredentials(record).clave, 'clave-super-secreta')
    assert.equal(model.getCredentials(record).usuario, 'usuario-sispro')
  })
})

test('una llave que no mide 32 bytes impide la escritura', async () => {
  const previous = process.env.SISPRO_ENCRYPTION_KEY
  process.env.SISPRO_ENCRYPTION_KEY = Buffer.from('corta').toString('base64')
  try {
    const model = createPrestadorMuvConfigModel(memoryPrisma())
    await assert.rejects(
      () =>
        model.upsertForPrestador('prestador-1', {
          repsCode: '680010389801',
          nit: '79904620-4',
          tipoDocumento: 'CC',
          credentials: { clientId: 'cliente', clientSecret: 'secreto-oauth' },
        }),
      /32 bytes/,
    )
  } finally {
    if (previous === undefined) delete process.env.SISPRO_ENCRYPTION_KEY
    else process.env.SISPRO_ENCRYPTION_KEY = previous
  }
})
