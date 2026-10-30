import assert from 'node:assert/strict'
import test from 'node:test'
import { clinicKioskRoom } from './kioskSocket.js'

test('clinicKioskRoom normaliza clinic: y valores crudos a la misma sala', () => {
  assert.equal(clinicKioskRoom('clinic:abc-123'), 'clinic_abc-123')
  assert.equal(clinicKioskRoom('abc-123'), 'clinic_abc-123')
  assert.equal(clinicKioskRoom(''), '')
})
