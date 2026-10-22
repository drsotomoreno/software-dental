import assert from 'node:assert/strict'
import test from 'node:test'
import {
  leerEstadoRips,
  normalizarPrefijo,
  numeroSoportePago,
  siguienteConsecutivo,
  vincularPagoAtencion,
  vincularPagoEnNotas,
} from './atencionPago.ts'

function nota(extra = {}) {
  return {
    id: 'nota-1',
    procedure: 'Obturación',
    clinicalNote: 'Control firmado',
    contentHash: 'abc123',
    isLocked: true,
    valorProcedimiento: 80000,
    estadoRips: 'PENDIENTE_PAGO',
    ...extra,
  }
}

test('cada titular avanza su propio consecutivo y el soporte usa el prefijo RC-', () => {
  assert.equal(siguienteConsecutivo(0), 1)
  assert.equal(siguienteConsecutivo(undefined), 1)
  assert.equal(siguienteConsecutivo(12), 13)
  assert.equal(normalizarPrefijo(''), 'RC-')
  assert.equal(numeroSoportePago('RC-', 1), 'RC-1')
  assert.equal(numeroSoportePago('CC-', 4), 'CC-4')
  assert.throws(() => normalizarPrefijo('PREFIJO-LARGO'), /10 caracteres/)
})

test('una atención firmada se asocia a un pago sin tocar el contenido clínico', () => {
  const original = nota()
  const linked = vincularPagoAtencion(original, {
    pagoId: 'recibo-1',
    numeroSoportePago: 'RC-1',
    conceptoPago: 'Obturación resina',
    valorProcedimiento: 80000,
  })

  assert.equal(linked.pagoId, 'recibo-1')
  assert.equal(linked.numeroSoportePago, 'RC-1')
  assert.equal(linked.estadoRips, 'PAGADO')
  assert.equal(linked.procedure, 'Obturación')
  assert.equal(linked.clinicalNote, 'Control firmado')
  assert.equal(linked.contentHash, 'abc123')
  assert.equal(original.estadoRips, 'PENDIENTE_PAGO')
})

test('la atención puede quedar sin costo o pendiente y suelta el recibo', () => {
  const paid = nota({
    pagoId: 'recibo-1',
    numeroSoportePago: 'RC-1',
    estadoRips: 'PAGADO',
  })

  const free = vincularPagoAtencion(paid, { sinCosto: true, conceptoPago: 'Garantía' })
  assert.equal(free.estadoRips, 'SIN_COSTO')
  assert.equal(free.pagoId, null)
  assert.equal(free.numeroSoportePago, null)
  assert.equal(free.valorProcedimiento, 0)
  assert.equal(free.conceptoPago, 'Garantía')

  const pending = vincularPagoAtencion(paid, { pendiente: true })
  assert.equal(pending.estadoRips, 'PENDIENTE')
  assert.equal(pending.pagoId, null)
  assert.equal(pending.valorProcedimiento, 80000)

  const notes = vincularPagoEnNotas([nota(), nota({ id: 'nota-2' })], 'nota-2', {
    sinCosto: true,
  })
  assert.equal(notes[0].estadoRips, 'PENDIENTE_PAGO')
  assert.equal(notes[1].estadoRips, 'SIN_COSTO')
  assert.equal(leerEstadoRips(''), 'PENDIENTE_PAGO')
  assert.equal(leerEstadoRips('sin_costo'), 'SIN_COSTO')
})
