import assert from 'node:assert/strict'
import test from 'node:test'
import {
  generalBudgetHasContent,
  mergeBudgetItems,
  preferGeneralBudgetSections,
  withMergedClinicalBudgets,
} from './clinicalBudgetMerge.js'

test('un autoguardado vacío no borra el presupuesto general ya guardado', () => {
  const existing = {
    budgetItems: [
      { id: 'b1', procedure: 'Resina 16', unitPrice: 180_000, quantity: 1 },
      { id: 'b2', procedure: 'Endodoncia 26', unitPrice: 450_000, quantity: 1 },
    ],
    budget: { subtotal: 630_000, discount: 0, total: 630_000, currency: 'COP' },
  }
  const incoming = {
    budgetItems: [],
    budget: { subtotal: 0, discount: 0, total: 0, currency: 'COP' },
  }

  const kept = preferGeneralBudgetSections(existing, incoming)
  assert.equal(kept.budgetItems.length, 2)
  assert.equal(kept.budget.total, 630_000)
  assert.equal(generalBudgetHasContent(kept), true)
})

test('la unión por id conserva líneas de presupuesto de ambas terminales', () => {
  const left = [{ id: 'b1', procedure: 'Limpieza', unitPrice: 80_000, quantity: 1 }]
  const right = [
    { id: 'b1', procedure: 'Limpieza', unitPrice: 90_000, quantity: 1, cupsCode: '890301' },
    { id: 'b2', procedure: 'Resina', unitPrice: 150_000, quantity: 1 },
  ]
  const merged = mergeBudgetItems(left, right)
  assert.equal(merged.length, 2)
  assert.equal(merged.find((row) => row.id === 'b1')?.cupsCode, '890301')
  assert.ok(merged.some((row) => row.id === 'b2'))
})

test('el sync no deja un borrador clínico sin el presupuesto que ya tenía valuationDraft', () => {
  const rich = {
    clinicalDraft: {
      anamnesis: { chiefComplaint: 'Control' },
      budgetItems: [],
      budget: { total: 0 },
    },
    valuationDraft: {
      budgetItems: [{ id: 'v1', procedure: 'Ortodoncia inicial', unitPrice: 1_200_000, quantity: 1 }],
      budget: { total: 1_200_000 },
    },
  }
  const emptyPull = {
    clinicalDraft: {
      anamnesis: { chiefComplaint: 'Control' },
      budgetItems: [],
    },
    valuationDraft: {
      budgetItems: [],
    },
  }

  const merged = withMergedClinicalBudgets(emptyPull, rich)
  assert.equal(merged.valuationDraft.budgetItems.length, 1)
  assert.equal(merged.valuationDraft.budgetItems[0].procedure, 'Ortodoncia inicial')
})
