import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

function isCompletedPatient(patient) {
  return patient.treatmentCompleted === true
}

function isValuatedOnlyPatient(patient) {
  if (patient.treatmentCompleted === true) return false
  if (patient.valuationOnly === false) return false
  return patient.valuationOnly === true || patient.phase === 'VALORACION_RAPIDA'
}

function isActivePatient(patient) {
  return !isValuatedOnlyPatient(patient) && !isCompletedPatient(patient)
}

test('fuente patient.ts declara filtro valuationOnly || VALORACION_RAPIDA', async () => {
  const src = await readFile(join(here, 'patient.ts'), 'utf8')
  assert.match(src, /valuationOnly === true \|\| patient\.phase === 'VALORACION_RAPIDA'/)
  assert.match(src, /valuationOnly === false/)
})

test('Valorados: valuationOnly true o phase VALORACION_RAPIDA (status null OK)', () => {
  assert.equal(
    isValuatedOnlyPatient({
      valuationOnly: true,
      phase: 'VALORACION_RAPIDA',
      status: null,
    }),
    true,
  )
  assert.equal(
    isValuatedOnlyPatient({
      valuationOnly: true,
      phase: null,
      status: null,
    }),
    true,
  )
  assert.equal(
    isValuatedOnlyPatient({
      valuationOnly: undefined,
      phase: 'VALORACION_RAPIDA',
      status: null,
    }),
    true,
  )
})

test('historia completa (valuationOnly false) no es Valorado', () => {
  assert.equal(
    isValuatedOnlyPatient({
      valuationOnly: false,
      phase: 'VALORACION_RAPIDA',
    }),
    false,
  )
  assert.equal(
    isActivePatient({
      valuationOnly: false,
      phase: 'VALORACION_RAPIDA',
      treatmentCompleted: false,
    }),
    true,
  )
})

test('terminados no son Valorados', () => {
  assert.equal(
    isValuatedOnlyPatient({
      valuationOnly: true,
      phase: 'VALORACION_RAPIDA',
      treatmentCompleted: true,
    }),
    false,
  )
})
