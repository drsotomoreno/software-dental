import assert from 'node:assert/strict'
import test from 'node:test'
import { deleteEmailOtp, loadEmailOtp, saveEmailOtp } from './emailOtpStore.js'

test('OTP dedicado sobrevive save/load (memoria + archivo)', async () => {
  const email = `otp-test-${Date.now()}@example.com`
  const record = {
    email,
    nombre: 'Prueba OTP',
    phone_number: '573001234567',
    passwordHash: 'hash',
    code: '020822',
    codeHash: 'codehash-020822',
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    attempts: 0,
  }

  try {
    const saved = await saveEmailOtp(record)
    assert.equal(saved.ok, true)

    const loaded = await loadEmailOtp(email)
    assert.ok(loaded)
    assert.equal(loaded.code, '020822')
    assert.equal(loaded.email, email)
    assert.equal(loaded.codeHash, 'codehash-020822')
  } finally {
    await deleteEmailOtp(email)
    const gone = await loadEmailOtp(email)
    assert.equal(gone, null)
  }
})
