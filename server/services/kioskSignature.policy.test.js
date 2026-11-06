import assert from 'node:assert/strict'
import test from 'node:test'
import { assertKioskPatientSignatureAllowed } from './kioskSignature.service.js'

test('la evolución rechaza la firma del paciente en la tableta', () => {
  assert.throws(
    () =>
      assertKioskPatientSignatureAllowed({
        documentType: 'EVOLUTION',
        formData: {},
      }),
    (error) => error.code === 'EVOLUTION_PATIENT_SIGNATURE_FORBIDDEN',
  )
})

test('el consentimiento de un menor exige nombre y cédula del acudiente', () => {
  assert.throws(
    () =>
      assertKioskPatientSignatureAllowed({
        documentType: 'CONSENT',
        formData: { esMenorDeEdad: true },
      }),
    (error) => error.code === 'GUARDIAN_REQUIRED',
  )

  assert.doesNotThrow(() =>
    assertKioskPatientSignatureAllowed({
      documentType: 'CONSENT',
      formData: {
        esMenorDeEdad: true,
        guardianName: 'Ana Pérez',
        guardianDocument: '1234567890',
      },
    }),
  )
})

test('el intake con tarjeta de identidad exige acudiente', () => {
  assert.throws(
    () =>
      assertKioskPatientSignatureAllowed({
        documentType: 'INTAKE',
        formData: { datosBasicos: { documentType: 'TI' } },
      }),
    (error) => error.code === 'GUARDIAN_REQUIRED',
  )
})

test('el intake de un adulto no exige acudiente', () => {
  assert.doesNotThrow(() =>
    assertKioskPatientSignatureAllowed({
      documentType: 'INTAKE',
      formData: { datosBasicos: { documentType: 'CC' } },
    }),
  )
})
