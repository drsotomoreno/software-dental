import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  listBudgetOrphanLines,
  patchBudgetOrphanLine,
  resolveUnifiedTreatmentBudgetRows,
} from './unifiedTreatmentBudget.ts'

describe('unifiedTreatmentBudget hybrid read', () => {
  it('keeps plan rows and surfaces budget orphans without duplicating linked lines', () => {
    const plan = [
      {
        id: 'plan-1',
        phase: 'fase_ii',
        procedure: 'Resina',
        cupsCode: '890301',
        quantity: 1,
        unitPrice: 80000,
        patientApproved: 'pendiente',
        executionStatus: 'pendiente',
      },
    ]
    const budgetItems = [
      {
        id: 'bud-1',
        treatmentPlanItemId: 'plan-1',
        procedure: 'Resina',
        cupsCode: '890301',
        quantity: 1,
        unitPrice: 80000,
        source: 'treatment_plan',
      },
      {
        id: 'bud-orphan',
        procedure: 'Profilaxis',
        cupsCode: '997102',
        quantity: 1,
        unitPrice: 50000,
        source: 'manual',
      },
    ]

    const rows = resolveUnifiedTreatmentBudgetRows(plan, budgetItems)
    assert.equal(rows.length, 2)
    assert.equal(rows[0].kind, 'plan')
    assert.equal(rows[0].rowId, 'plan-1')
    assert.equal(rows[1].kind, 'budget_orphan')
    assert.equal(rows[1].rowId, 'bud-orphan')
    assert.equal(listBudgetOrphanLines(plan, budgetItems).length, 1)
  })

  it('patches orphan unit price without touching the global catalog shape', () => {
    const budgetItems = [
      {
        id: 'bud-orphan',
        procedure: 'Profilaxis',
        cupsCode: '997102',
        quantity: 1,
        unitPrice: 50000,
        source: 'manual',
      },
    ]
    const next = patchBudgetOrphanLine(budgetItems, 'bud-orphan', { unitPrice: 45000 })
    assert.equal(next[0].unitPrice, 45000)
    assert.equal(next[0].procedure, 'Profilaxis')
  })
})
