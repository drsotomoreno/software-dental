import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const dir = await mkdtemp(join(tmpdir(), 'mhd-pending-'))
process.env.PENDING_REGISTRATIONS_FILE = join(dir, 'pending-registrations.json')
process.env.PENDING_REGISTRATIONS_KEY = 'pending-registrations-test'
process.env.PENDING_REGISTRATIONS_DISABLE_PG = '1'

const store = await import('./pendingRegistrationStore.js')

test('purgeExpiredRecords quita lo que superó los 15 minutos', () => {
  const now = Date.parse('2026-11-15T20:00:00.000Z')
  const kept = store.purgeExpiredRecords(
    [
      { pendingId: 'vivo', expiresAt: '2026-11-15T20:10:00.000Z' },
      { pendingId: 'viejo', expiresAt: '2026-11-15T19:00:00.000Z' },
    ],
    now,
  )
  assert.deepEqual(kept.map((item) => item.pendingId), ['vivo'])
})

test('el pendiente no marca WhatsApp si el celular no coincide y expira al leerlo', async () => {
  const saved = await store.savePendingRegistration({
    nombre: 'Dra. Ana',
    email: 'ana@clinica.co',
    phoneNumber: '573001234567',
    passwordHash: 'a'.repeat(64),
  })
  assert.equal(saved.emailCode.length, 6)
  assert.match(saved.whatsappCode, /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/)
  assert.equal(saved.whatsappVerified, false)

  const wrongPhone = await store.verifyPendingWhatsApp({
    codes: [saved.whatsappCode],
    senderDigits: ['573009999999'],
  })
  assert.equal(wrongPhone.verified, false)

  const local = await store.verifyPendingWhatsApp({
    codes: [saved.whatsappCode],
    senderDigits: ['3001234567'],
  })
  assert.equal(local.verified, true)

  const bogus = saved.emailCode === '000000' ? '111111' : '000000'
  const wrongCode = await store.beginPendingCompletion({
    pendingId: saved.pendingId,
    emailCode: bogus,
  })
  assert.equal(wrongCode.ok, false)

  const ready = await store.beginPendingCompletion({
    pendingId: saved.pendingId,
    emailCode: saved.emailCode,
  })
  assert.equal(ready.ok, true)
  assert.equal(ready.record.emailVerified, true)
  assert.equal(ready.record.whatsappVerified, true)

  await store.restorePendingRecord({
    ...ready.record,
    completing: false,
    expiresAt: new Date(Date.now() - 1000).toISOString(),
  })
  const status = await store.readPendingStatus(saved.pendingId)
  assert.equal(status.expired, true)
})

test.after(async () => {
  await rm(dir, { recursive: true, force: true })
})
