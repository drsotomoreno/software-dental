import assert from 'node:assert/strict'
import test from 'node:test'
import {
  REHAB_INDIRECT_NON_METAL_RESTORATION_CUPS,
  REHAB_TREATMENT_OPTIONS,
} from '../components/clinical/rehabilitation/rehab-odontogram/constants.ts'

test('carilla dental indirecta usa CUPS 233201 para autocompletar en el anexo', () => {
  assert.equal(REHAB_INDIRECT_NON_METAL_RESTORATION_CUPS.code, '233201')

  const carilla = REHAB_TREATMENT_OPTIONS.find((option) => option.id === 'carilla')
  assert.ok(carilla)
  assert.equal(carilla.label, 'Carilla Dental Indirecta')
  assert.equal(carilla.cupsCode, '233201')
  assert.match(carilla.cupsLabel ?? '', /incrustación no metálica/i)
})
