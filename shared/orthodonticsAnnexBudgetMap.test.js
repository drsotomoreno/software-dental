import assert from 'node:assert/strict'
import test from 'node:test'
import { mapAnnexBudgetToClinicalBudget } from './orthodonticsAnnexBudgetMap.js'

test('solo la duración del plan no se mapea como presupuesto', () => {
  assert.equal(
    mapAnnexBudgetToClinicalBudget({
      treatmentType: 'conventional',
      orthodonticBudget: {
        kind: 'standard',
        values: {
          initialPayment: 0,
          monthlyControlsCount: 18,
          pricePerControl: 0,
          retainerPrice: 0,
        },
      },
    }),
    null,
  )
})

test('sin calculadora del anexo no aporta presupuesto clínico', () => {
  assert.equal(
    mapAnnexBudgetToClinicalBudget({
      treatmentType: 'conventional',
      orthodonticBudget: null,
    }),
    null,
  )
})

test('montos reales de la calculadora sí mapean al presupuesto clínico', () => {
  const mapped = mapAnnexBudgetToClinicalBudget({
    treatmentType: 'conventional',
    orthodonticBudget: {
      kind: 'standard',
      values: {
        initialPayment: 800_000,
        monthlyControlsCount: 12,
        pricePerControl: 150_000,
        retainerPrice: 300_000,
      },
    },
  })
  assert.deepEqual(mapped, {
    active: true,
    initialInstallment: { quantity: 1, unitPrice: 800_000 },
    controls: { quantity: 12, unitPrice: 150_000 },
    retainers: { quantity: 1, unitPrice: 300_000 },
  })
})

test('presupuesto multiphase sin montos no borra el clínico', () => {
  assert.equal(
    mapAnnexBudgetToClinicalBudget({
      treatmentType: 'aligners',
      orthodonticBudget: {
        kind: 'multi_phase',
        values: {
          retainerPrice: 0,
          phases: [
            { phaseName: 'Fase 1', initialPayment: 0, monthlyControlsCount: 6, pricePerControl: 0 },
          ],
        },
      },
    }),
    null,
  )
})
