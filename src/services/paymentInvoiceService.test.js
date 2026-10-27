import assert from 'node:assert/strict'
import test from 'node:test'
import { createAutoPaymentInvoice } from './paymentInvoiceService.ts'

test('el recibo de caja interno no reserva un número de factura FV', () => {
  const recibo = createAutoPaymentInvoice({
    paymentDate: '2026-10-27',
    amount: 200000,
    paymentReason: 'Exodoncia de dientes permanentes',
    documentKind: 'recibo_interno',
  })
  const factura = createAutoPaymentInvoice({
    paymentDate: '2026-10-27',
    amount: 200000,
    documentKind: 'factura',
  })

  assert.match(recibo.invoiceNumber, /^RC\d{8}$/)
  assert.match(factura.invoiceNumber, /^FV\d{8}$/)
  assert.doesNotMatch(recibo.notes ?? '', /factura electrónica de venta/i)
})
