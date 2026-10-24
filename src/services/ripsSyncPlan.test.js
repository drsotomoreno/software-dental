import assert from 'node:assert/strict'
import test from 'node:test'
import {
  decisionDeResultado,
  entradaListaParaMuv,
  esMismoDiaClinico,
  motivoRipsVisible,
  partirEnLotes,
  procesoAtascado,
  resumenRips,
} from './ripsSyncPlan.ts'

const ahora = new Date('2026-10-24T18:00:00.000Z')

test('el día clínico de RIPS es America/Bogota', () => {
  assert.equal(esMismoDiaClinico('2026-10-24T05:30:00.000Z', ahora), true)
  assert.equal(esMismoDiaClinico('2026-10-24T04:30:00.000Z', ahora), false)
})

test('el resumen separa listos, sincronizados de hoy y errores', () => {
  const summary = resumenRips(
    [
      { status: 'QUEUED', updatedAt: '2026-10-24T12:00:00.000Z' },
      { status: 'QUEUED', updatedAt: '2026-10-23T12:00:00.000Z' },
      { status: 'SYNCHRONIZED', updatedAt: '2026-10-24T15:00:00.000Z' },
      { status: 'SYNCHRONIZED', updatedAt: '2026-10-23T15:00:00.000Z' },
      { status: 'ERROR_RETRY', updatedAt: '2026-10-24T16:00:00.000Z' },
      { status: 'PROCESSING', updatedAt: '2026-10-24T16:00:00.000Z' },
    ],
    ahora,
  )
  assert.deepEqual(summary, { listos: 2, sincronizadosHoy: 1, conErrores: 1 })
})

test('el lote diario incluye reintentos y deja fuera la FEV sin CUFE', () => {
  assert.equal(entradaListaParaMuv({ status: 'QUEUED', type: 'WITHOUT_FEV' }), true)
  assert.equal(entradaListaParaMuv({ status: 'ERROR_RETRY', type: 'WITHOUT_FEV' }), true)
  assert.equal(entradaListaParaMuv({ status: 'ERROR_RETRY', type: 'WITH_FEV', cufe: 'CUFE-1' }), true)
  assert.equal(entradaListaParaMuv({ status: 'ERROR_RETRY', type: 'WITH_FEV' }), false)
  assert.equal(entradaListaParaMuv({ status: 'QUEUED', type: 'WITH_FEV' }), false)
  assert.equal(entradaListaParaMuv({ status: 'PROCESSING', type: 'WITHOUT_FEV' }), false)
  assert.equal(entradaListaParaMuv({ status: 'SYNCHRONIZED', type: 'WITHOUT_FEV' }), false)
})

test('un envío sin FEV abandonado vuelve a la cola; la FEV en curso no', () => {
  const now = Date.parse('2026-10-24T18:00:00.000Z')
  assert.equal(
    procesoAtascado(
      { type: 'WITHOUT_FEV', status: 'PROCESSING', updatedAt: '2026-10-24T17:00:00.000Z' },
      now,
      20 * 60 * 1000,
    ),
    true,
  )
  assert.equal(
    procesoAtascado(
      { type: 'WITH_FEV', status: 'PROCESSING', updatedAt: '2026-10-24T12:00:00.000Z' },
      now,
    ),
    false,
  )
})

test('el lote se parte en grupos de 200 y el CUV o el rechazo deciden el estado local', () => {
  assert.equal(partirEnLotes([1, 2, 3], 2).length, 2)
  assert.equal(partirEnLotes(Array.from({ length: 201 }, (_, index) => index)).length, 2)
  assert.deepEqual(decisionDeResultado({ success: true, cuv: 'CUV-1' }), { kind: 'synchronized', cuv: 'CUV-1' })
  const retry = decisionDeResultado({
    success: false,
    errors: [{ code: 'RVC012', message: 'CIE-10 inválido', path: 'usuarios[0]' }],
  })
  assert.equal(retry.kind, 'retry')
  if (retry.kind === 'retry') assert.match(retry.errors[0].message, /usuarios\[0\]/)
  assert.match(motivoRipsVisible({ type: 'WITH_FEV', errors: [] }), /CUFE/)
  assert.match(motivoRipsVisible({ errors: [{ code: 'RVC012', message: 'CIE-10 inválido' }] }), /RVC012/)
})
