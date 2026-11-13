import assert from 'node:assert/strict'
import test from 'node:test'
import {
  mergePayloadNonDestructive,
  mergeSyncedRecordNonDestructive,
  preserveOmittedLocalFields,
} from './clinicalSyncMerge.js'

test('mergePayloadNonDestructive conserva llaves del base omitidas por el entrante', () => {
  const merged = mergePayloadNonDestructive(
    {
      valuationOnly: true,
      phase: 'VALORACION_RAPIDA',
      firstName: 'Ana',
      documentNumber: '1',
    },
    {
      firstName: 'Ana',
      documentNumber: '1',
      phone: '300',
      valuationOnly: undefined,
    },
  )
  assert.equal(merged.valuationOnly, true)
  assert.equal(merged.phase, 'VALORACION_RAPIDA')
  assert.equal(merged.phone, '300')
})

test('mergePayloadNonDestructive aplica false explícito (historia completa)', () => {
  const merged = mergePayloadNonDestructive(
    { valuationOnly: true, phase: 'VALORACION_RAPIDA' },
    { valuationOnly: false, phase: 'VALORACION_RAPIDA' },
  )
  assert.equal(merged.valuationOnly, false)
})

test('mergeSyncedRecordNonDestructive no reemplaza payload completo', () => {
  const prev = {
    syncId: 'p1',
    clinicId: 'clinic:a',
    updatedAt: '2026-01-01T00:00:00.000Z',
    payload: {
      valuationOnly: true,
      phase: 'VALORACION_RAPIDA',
      treatmentCompleted: false,
      firstName: 'Ana',
      email: 'a@x.com',
    },
  }
  const next = {
    syncId: 'p1',
    clinicId: 'clinic:a',
    updatedAt: '2026-11-13T16:20:00.000Z',
    payload: {
      firstName: 'Ana',
      phone: '300',
    },
  }
  const merged = mergeSyncedRecordNonDestructive(prev, next)
  assert.equal(merged.payload.valuationOnly, true)
  assert.equal(merged.payload.phase, 'VALORACION_RAPIDA')
  assert.equal(merged.payload.email, 'a@x.com')
  assert.equal(merged.payload.phone, '300')
  assert.equal(merged.updatedAt, next.updatedAt)
})

test('preserveOmittedLocalFields rellena flags omitidos en pull', () => {
  const local = { valuationOnly: true, phase: 'VALORACION_RAPIDA', firstName: 'Ana' }
  const incoming = { firstName: 'Ana', phone: '1', syncId: 'x' }
  const out = preserveOmittedLocalFields(local, incoming)
  assert.equal(out.valuationOnly, true)
  assert.equal(out.phase, 'VALORACION_RAPIDA')
  assert.equal(out.phone, '1')
})
