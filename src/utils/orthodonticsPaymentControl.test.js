import assert from 'node:assert/strict'
import test from 'node:test'
import {
  calcOrthodonticsPaymentsTotal,
  conceptForOrthodonticsProcedure,
  conceptRemaining,
  paidAmountForConcept,
  paymentTypeForConcept,
  suggestControlNumber,
} from './orthodonticsPaymentConcepts.ts'

const budget = {
  active: true,
  initialInstallment: { quantity: 1, unitPrice: 400000 },
  controls: { quantity: 3, unitPrice: 80000 },
  retainers: { quantity: 2, unitPrice: 150000 },
}

test('cada tarjeta de ortodoncia apunta a su concepto y al tipo guardado en IndexedDB', () => {
  assert.equal(conceptForOrthodonticsProcedure('Ortodoncia — Cuota inicial'), 'cuota_inicial')
  assert.equal(conceptForOrthodonticsProcedure('Ortodoncia — Controles'), 'controles')
  assert.equal(conceptForOrthodonticsProcedure('Ortodoncia — Retenedores'), 'retenedores')
  assert.equal(paymentTypeForConcept('cuota_inicial'), 'cuota_inicial')
  assert.equal(paymentTypeForConcept('controles'), 'control')
  assert.equal(paymentTypeForConcept('retenedores'), 'retenedores')
})

test('el saldo de una tarjeta no descuenta abonos de otro concepto', () => {
  const payments = [
    { paymentType: 'cuota_inicial', amount: 150000 },
    { paymentType: 'control', amount: 80000 },
    { paymentType: 'retenedores', amount: 50000 },
    { paymentType: 'adicional', amount: 20000 },
  ]

  assert.equal(paidAmountForConcept(payments, 'cuota_inicial'), 150000)
  assert.equal(conceptRemaining(400000, payments, 'cuota_inicial'), 250000)
  assert.equal(paidAmountForConcept(payments, 'controles'), 80000)
  assert.equal(conceptRemaining(240000, payments, 'controles'), 160000)
  assert.equal(conceptRemaining(300000, payments, 'retenedores'), 250000)
  assert.equal(
    calcOrthodonticsPaymentsTotal(payments),
    paidAmountForConcept(payments, 'cuota_inicial') +
      paidAmountForConcept(payments, 'controles') +
      paidAmountForConcept(payments, 'retenedores') +
      20000,
  )
  assert.equal(940000 - calcOrthodonticsPaymentsTotal(payments), 640000)
})

test('sugiere el primer control que todavía no tiene abono', () => {
  const payments = [
    { paymentType: 'control', amount: 80000, controlNumber: 1 },
    { paymentType: 'control', amount: 80000, controlNumber: 3 },
  ]
  assert.equal(suggestControlNumber(budget, payments), 2)
})
