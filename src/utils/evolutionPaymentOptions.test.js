import assert from 'node:assert/strict'
import test from 'node:test'
import { armarOpcionesPago, etiquetaOpcionPago } from './evolutionPaymentOptions.ts'

test('arma el selector con consecutivo, fecha, valor y concepto', () => {
  const opciones = armarOpcionesPago({
    pagos: [
      {
        id: 'pago-1',
        paymentDate: '2026-10-20',
        amount: 80000,
        paymentReason: 'Obturación',
        documentKind: 'recibo_interno',
        invoices: [
          {
            id: 'rc-1',
            invoiceNumber: 'RC-12',
            invoiceDate: '2026-10-20',
            amount: 80000,
            emissionMode: 'manual',
          },
        ],
      },
    ],
    facturas: [
      {
        id: 'fev-1',
        invoiceNumber: 'FE-4',
        issueDate: '2026-10-21',
        netPayable: 150000,
        status: 'accepted',
        items: [{ description: 'Endodoncia' }],
      },
      {
        id: 'fev-anulada',
        invoiceNumber: 'FE-1',
        issueDate: '2026-10-01',
        netPayable: 10,
        status: 'cancelled',
        items: [],
      },
    ],
  })

  assert.deepEqual(
    opciones.map((opcion) => opcion.consecutivo),
    ['FE-4', 'RC-12'],
  )
  assert.equal(opciones[0].tipo, 'fev')
  assert.equal(opciones[1].tipo, 'recibo_interno')
  assert.match(etiquetaOpcionPago(opciones[1]), /RC-12/)
  assert.match(
    etiquetaOpcionPago({ ...opciones[1], consecutivo: 'FV00000002' }),
    /^Recibo FV00000002/,
  )
  assert.match(etiquetaOpcionPago(opciones[1]), /Obturación/)
  assert.match(etiquetaOpcionPago(opciones[1]), /80\.000|80000/)
})
