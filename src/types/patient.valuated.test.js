import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

function isValuatedOnlyPatient(patient) {
  if (patient.treatmentCompleted === true || patient.treatmentCompleted === 'true') return false
  const raw = patient.valuationOnly
  if (raw === true || raw === 'true') return true
  if (raw === false || raw === 'false') return false
  return patient.phase === 'VALORACION_RAPIDA'
}

function isCompletedPatient(patient) {
  return patient.treatmentCompleted === true || patient.treatmentCompleted === 'true'
}

function isActivePatient(patient) {
  return !isValuatedOnlyPatient(patient) && !isCompletedPatient(patient)
}

test('fuente patient.ts declara filtro valuationOnly true/false + phase', async () => {
  const src = await readFile(join(here, 'patient.ts'), 'utf8')
  assert.match(src, /raw === true \|\| raw === 'true'/)
  assert.match(src, /raw === false \|\| raw === 'false'/)
  assert.match(src, /phase === 'VALORACION_RAPIDA'/)
})

test('Valorados: valuationOnly true o phase sin false', () => {
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
      valuationOnly: 'true',
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

test('historia completa (valuationOnly false) no es Valorado aunque phase VALORACION_RAPIDA', () => {
  assert.equal(
    isValuatedOnlyPatient({
      valuationOnly: false,
      phase: 'VALORACION_RAPIDA',
    }),
    false,
  )
  assert.equal(
    isValuatedOnlyPatient({
      valuationOnly: 'false',
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
