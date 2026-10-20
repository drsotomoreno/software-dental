import assert from 'node:assert/strict'
import test from 'node:test'
import { resolverModoEvolucionDictada } from '../services/evolucionDictadaRuta.js'

test('el botón sin factura usa el MUV aunque el prestador sea obligado', () => {
  assert.equal(
    resolverModoEvolucionDictada({
      modo: 'sin_factura',
      perfilFiscal: 'Obligado_FEV',
    }),
    'muv_sin_factura',
  )
})

test('el botón con factura no entra al MUV sin factura', () => {
  assert.equal(
    resolverModoEvolucionDictada({
      modo: 'con_factura',
      perfilFiscal: 'No_Obligado',
      invoice: { payableAmount: 80000 },
    }),
    'con_factura',
  )
  assert.equal(
    resolverModoEvolucionDictada({
      modo: 'con_factura',
      perfilFiscal: 'No_Obligado',
    }),
    'con_factura',
  )
})

test('el dictado sin modo conserva la regla del perfil fiscal', () => {
  assert.equal(
    resolverModoEvolucionDictada({ perfilFiscal: 'No_Obligado' }),
    'muv_sin_factura',
  )
  assert.equal(
    resolverModoEvolucionDictada({
      perfilFiscal: 'No_Obligado',
      invoice: { payableAmount: 1 },
    }),
    'con_factura',
  )
  assert.equal(
    resolverModoEvolucionDictada({ perfilFiscal: 'Obligado_FEV' }),
    'con_factura',
  )
})
