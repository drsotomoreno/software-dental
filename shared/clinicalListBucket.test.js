import assert from 'node:assert/strict'
import test from 'node:test'
import {
  classifyPatientListBucket,
  isActivePatient,
  isCompletedPatient,
  isValuatedOnlyPatient,
  patientFlagsFromSyncRecord,
} from './clinicalListBucket.js'

test('terminado gana sobre valuationOnly', () => {
  assert.equal(
    classifyPatientListBucket({
      valuationOnly: true,
      phase: 'VALORACION_RAPIDA',
      treatmentCompleted: true,
    }),
    'terminado',
  )
  assert.equal(isCompletedPatient({ treatmentCompleted: 'true' }), true)
  assert.equal(
    isValuatedOnlyPatient({
      valuationOnly: true,
      treatmentCompleted: true,
    }),
    false,
  )
})

test('valorado: valuationOnly true o phase si ausente', () => {
  assert.equal(
    classifyPatientListBucket({
      valuationOnly: true,
      phase: 'VALORACION_RAPIDA',
    }),
    'valorado',
  )
  assert.equal(
    classifyPatientListBucket({
      phase: 'VALORACION_RAPIDA',
    }),
    'valorado',
  )
})

test('activo: valuationOnly false aunque phase VALORACION_RAPIDA', () => {
  assert.equal(
    classifyPatientListBucket({
      valuationOnly: false,
      phase: 'VALORACION_RAPIDA',
      treatmentCompleted: false,
    }),
    'activo',
  )
  assert.equal(
    isActivePatient({
      valuationOnly: 'false',
      phase: 'VALORACION_RAPIDA',
      treatmentCompleted: false,
    }),
    true,
  )
})

test('patientFlagsFromSyncRecord lee payload sync', () => {
  const flags = patientFlagsFromSyncRecord({
    syncId: 'p1',
    payload: {
      firstName: 'Isabel',
      lastName: 'de la Rosa',
      treatmentCompleted: false,
      valuationOnly: false,
      phase: 'TRATAMIENTO_ACEPTADO',
    },
  })
  assert.equal(classifyPatientListBucket(flags), 'activo')
  assert.equal(flags.firstName, 'Isabel')
})
