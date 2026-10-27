import assert from 'node:assert/strict'
import test from 'node:test'
import {
  esEvolucionSinCosto,
  esPrefijoSinCosto,
  motivoSinCostoDe,
  numeroPaqueteSinCosto,
  prefijoTransmisionSinCosto,
  sesionEsSinCosto,
  validarSumatoriaAgrupador,
  valoresFinancierosCostoCero,
} from './ripsSinCosto.js'

test('el consecutivo no financiero usa CTRL, GAR o CORT con tres dígitos', () => {
  assert.equal(prefijoTransmisionSinCosto('garantía'), 'GAR-')
  assert.equal(prefijoTransmisionSinCosto('Cortesía'), 'CORT-')
  assert.equal(motivoSinCostoDe(''), 'control')
  assert.equal(numeroPaqueteSinCosto('CTRL-', 50), 'CTRL-050')
  assert.equal(numeroPaqueteSinCosto('GAR-', 2), 'GAR-002')
  assert.equal(numeroPaqueteSinCosto('cortesia', 1), 'CORT-001')
  assert.equal(esPrefijoSinCosto('CTRL-050'), true)
  assert.equal(esPrefijoSinCosto('RC-15'), false)
})

test('la opción A deja procedimiento, descuento y neto en cero', () => {
  assert.deepEqual(valoresFinancierosCostoCero(), {
    valorProcedimiento: 0,
    valorDescuento: 0,
    valorNeto: 0,
    vrServicio: 0,
    valorPagoModerador: 0,
    conceptoRecaudo: '05',
  })
})

test('cero contra cero cuadra y un descuadre contra cero no', () => {
  const cero = validarSumatoriaAgrupador({
    valorTotal: 0,
    numero: 'CTRL-050',
    items: [{ valorNeto: 0 }, { valorNeto: 0 }],
  })
  assert.equal(cero.ok, true)
  assert.equal(cero.permiteCero, true)
  assert.equal(cero.suma, 0)

  const descuadre = validarSumatoriaAgrupador({
    valorTotal: 0,
    numero: 'CTRL-050',
    items: [{ valorNeto: 50000 }],
  })
  assert.equal(descuadre.ok, false)
  assert.match(descuadre.message, /CTRL-050/)
  assert.match(descuadre.message, /50000/)

  const pago = validarSumatoriaAgrupador({
    valorTotal: 80000,
    items: [{ vrServicio: 80000 }],
  })
  assert.equal(pago.ok, true)
  assert.equal(pago.permiteCero, false)
})

test('un recibo o una FEV explícitos no se tratan como transmisión sin costo', () => {
  assert.equal(esEvolucionSinCosto({ es_sin_costo: true, ripsMetadata: { tipoVinculacionFinanciera: 'fev' } }), false)
  assert.equal(esEvolucionSinCosto({ isBillable: false, estadoRips: 'SIN_COSTO' }), true)
  assert.equal(esEvolucionSinCosto({ motivoSinCosto: 'garantia' }), true)
  assert.equal(esEvolucionSinCosto({ cost: 0, isBillable: true, estadoRips: 'PAGADO' }), false)
  assert.equal(
    sesionEsSinCosto([
      { esSinCosto: true },
      { kind: 'addendum', isBillable: true },
    ]),
    true,
  )
  assert.equal(sesionEsSinCosto([{ isBillable: true }, { esSinCosto: true }]), false)
})
