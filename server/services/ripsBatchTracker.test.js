import assert from 'node:assert/strict'
import test from 'node:test'
import { createRipsBatchTracker } from './ripsBatchTracker.js'

test('el lote guarda CUV y rechazos, y otro prestador no lo lee', () => {
  const tracker = createRipsBatchTracker()
  tracker.abrir(
    'batch-1',
    [
      { evolutionId: 'evo-ok', patientId: 'pac-1' },
      { evolutionId: 'evo-mal', patientId: 'pac-2' },
    ],
    'user-1',
  )

  assert.equal(tracker.obtener('batch-1', 'user-2'), null)
  const parcial = tracker.obtener('batch-1', 'user-1')
  assert.equal(parcial.status, 'processing')
  assert.equal(parcial.completed, 0)

  tracker.anotar('batch-1', { evolutionId: 'evo-ok', patientId: 'pac-1', success: true, cuv: 'CUV-1', errors: [] })
  tracker.anotar('batch-1', {
    evolutionId: 'evo-mal',
    patientId: 'pac-2',
    success: false,
    errors: [{ code: 'RVC012', message: 'CIE-10 inválido', path: 'usuarios[0]' }],
  })
  tracker.cerrar('batch-1')

  const listo = tracker.obtener('batch-1', 'user-1')
  assert.equal(listo.status, 'done')
  assert.equal(listo.count, 2)
  assert.equal(listo.items[0].cuv, 'CUV-1')
  assert.equal(listo.items[0].success, true)
  assert.equal(listo.items[1].success, false)
  assert.equal(listo.items[1].errors[0].code, 'RVC012')
  assert.equal(listo.items[0].pending, undefined)
})
