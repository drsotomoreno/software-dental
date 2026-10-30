import assert from 'node:assert/strict'
import test from 'node:test'
import {
  edadEnAnios,
  esMenorDeEdad,
  etiquetaFirmaPacienteOAcudiente,
  guardianAuthorizationComplete,
} from './patientMinorAge.ts'

const NOW = new Date('2026-10-30T12:00:00.000Z')

test('calcula edad y marca menor de 18 en tiempo real', () => {
  assert.equal(edadEnAnios('2015-10-30', NOW), 11)
  assert.equal(esMenorDeEdad('2015-10-30', NOW), true)
  assert.equal(esMenorDeEdad('2000-01-01', NOW), false)
  // Cumple 18 el mismo día → ya es adulto legal.
  assert.equal(esMenorDeEdad('2008-10-30', NOW), false)
  // Aún no cumple años → sigue siendo menor.
  assert.equal(esMenorDeEdad('2008-10-31', NOW), true)
})

test('sin fecha válida no asume minoría de edad', () => {
  assert.equal(esMenorDeEdad(''), false)
  assert.equal(esMenorDeEdad(undefined), false)
  assert.equal(esMenorDeEdad('fecha-invalida'), false)
})

test('etiqueta de firma y acudiente completo', () => {
  assert.equal(etiquetaFirmaPacienteOAcudiente(false), 'Firma del Paciente')
  assert.equal(etiquetaFirmaPacienteOAcudiente(true), 'Firma del Representante Legal')
  assert.equal(guardianAuthorizationComplete(false, '', ''), true)
  assert.equal(guardianAuthorizationComplete(true, 'Ana Pérez', '123'), true)
  assert.equal(guardianAuthorizationComplete(true, 'Ana Pérez', ''), false)
  assert.equal(guardianAuthorizationComplete(true, '', '123'), false)
})
