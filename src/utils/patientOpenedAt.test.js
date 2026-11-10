import assert from 'node:assert/strict'
import test from 'node:test'
import {
  conservarFechaApertura,
  etiquetaAperturaPaciente,
  ordenarPorAperturaDesc,
  selloAperturaPaciente,
  textoHistoriaCreadaEn,
} from '../../shared/patientOpenedAt.js'

test('conserva la fecha de apertura más antigua', () => {
  const antigua = '2026-11-01T14:00:00.000Z'
  const reciente = '2026-11-10T14:10:00.000Z'
  assert.equal(conservarFechaApertura(reciente, antigua), antigua)
  assert.equal(conservarFechaApertura(antigua, ''), antigua)
  assert.equal(conservarFechaApertura('', reciente), reciente)
  assert.equal(conservarFechaApertura('no-es-fecha', null), '')
})

test('etiqueta la historia en hora de Bogotá', () => {
  const iso = '2026-11-10T14:10:00.000Z'
  const etiqueta = etiquetaAperturaPaciente(iso)
  assert.match(etiqueta, /10/)
  assert.match(etiqueta, /noviembre/i)
  assert.match(etiqueta, /2026/)
  assert.match(etiqueta, /9:10/)
  assert.equal(textoHistoriaCreadaEn(iso), `Historia creada en ${etiqueta}`)
  assert.equal(textoHistoriaCreadaEn(''), 'Historia creada en —')
})

test('ordena pacientes valorados del más nuevo al más antiguo', () => {
  const ordenados = ordenarPorAperturaDesc([
    { id: 'viejo', createdAt: '2026-01-02T15:00:00.000Z' },
    { id: 'sin-fecha', createdAt: '' },
    { id: 'nuevo', createdAt: '2026-11-10T14:10:00.000Z' },
    { id: 'medio', createdAt: '2026-06-01T15:00:00.000Z' },
  ])
  assert.deepEqual(
    ordenados.map((row) => row.id),
    ['nuevo', 'medio', 'viejo', 'sin-fecha'],
  )
})

test('el sello de ingreso trae createdAt y updatedAt', () => {
  const sello = selloAperturaPaciente(new Date('2026-11-10T14:10:00.000Z'))
  assert.equal(sello.createdAt, '2026-11-10T14:10:00.000Z')
  assert.equal(sello.updatedAt, '2026-11-10T14:10:00.000Z')
})
