import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildBudgetFromTreatmentPlan,
  syncTreatmentPlanIntoGeneralBudget,
  treatmentPlanBudgetImportNotice,
} from './treatmentPlanBudgetExport.ts'

function planItem(patch) {
  return {
    id: 'plan-1',
    phase: 'fase_ii',
    procedure: '',
    quantity: 1,
    unitPrice: 0,
    patientApproved: 'pendiente',
    executionStatus: 'pendiente',
    source: 'diagnostico',
    ...patch,
  }
}

test('exporta al presupuesto la fila del plan que solo tiene diagnóstico y precio', () => {
  const plan = [
    planItem({
      id: 'caries-16',
      anatomicalZone: '16',
      toothNumber: 16,
      diagnosisCode: 'K02.1',
      diagnosisDescription: 'Caries de la dentina',
      unitPrice: 100000,
    }),
    planItem({
      id: 'ortho',
      procedure: 'Ortodoncia Convencional con Brackets — Brackets Metálicos Convencionales',
      unitPrice: 2200000,
      source: 'orthodontics_annex',
    }),
  ]

  const lines = buildBudgetFromTreatmentPlan(plan)
  assert.equal(lines.length, 1)
  assert.equal(lines[0].treatmentPlanItemId, 'caries-16')
  assert.equal(lines[0].procedure, 'K02.1 Caries de la dentina')
  assert.equal(lines[0].unitPrice, 100000)
  assert.equal(lines[0].quantity, 1)
  assert.equal(lines[0].anatomicalZone, '16')

  const again = buildBudgetFromTreatmentPlan(plan, lines)
  assert.equal(again.length, 1)
  assert.equal(again[0].id, lines[0].id)
})

test('el total clínico suma las filas del plan y no duplica la ortodoncia', () => {
  const plan = [
    planItem({ id: 'a', diagnosisCode: 'K02.1', diagnosisDescription: 'Caries de la dentina', anatomicalZone: '16', unitPrice: 100000 }),
    planItem({ id: 'b', diagnosisCode: 'K02.1', diagnosisDescription: 'Caries de la dentina', anatomicalZone: '35', unitPrice: 100000 }),
    planItem({ id: 'c', diagnosisCode: 'K08.1', diagnosisDescription: 'Pérdida de dientes', anatomicalZone: '41', unitPrice: 100000 }),
    planItem({ id: 'd', diagnosisCode: 'K01.0', diagnosisDescription: 'Dientes incluidos', anatomicalZone: '16, 14, 16, Q1', unitPrice: 100000 }),
    planItem({ id: 'e', diagnosisCode: 'K00.0', diagnosisDescription: 'Anodoncia', anatomicalZone: '16, 14, 16, Q1', unitPrice: 100000 }),
    planItem({
      id: 'ortho',
      procedure: 'Ortodoncia Convencional con Brackets — Brackets Metálicos Convencionales',
      unitPrice: 2200000,
      source: 'orthodontics_annex',
    }),
  ]

  const orthodontics = {
    active: true,
    initialInstallment: { quantity: 1, unitPrice: 1000000 },
    controls: { quantity: 12, unitPrice: 100000 },
    retainers: { quantity: 0, unitPrice: 0 },
  }

  const synced = syncTreatmentPlanIntoGeneralBudget(plan, [], 0, orthodontics)
  assert.equal(synced.budgetItems.length, 5)
  assert.equal(
    synced.budgetItems.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0),
    500000,
  )
  // 500.000 del plan + 1.000.000 + 12×100.000 de la calculadora de ortodoncia.
  assert.equal(synced.budget.subtotal, 2700000)
  assert.equal(synced.budget.total, 2700000)

  const notice = treatmentPlanBudgetImportNotice(plan, [], synced.budgetItems)
  assert.match(notice, /Se agregaron 5 procedimientos/)

  const already = treatmentPlanBudgetImportNotice(plan, synced.budgetItems, synced.budgetItems)
  assert.equal(already, 'Los procedimientos del plan ya están en el presupuesto.')
})

test('una zona con varias piezas no multiplica el precio de la fila', () => {
  const plan = [
    planItem({
      id: 'grupo',
      diagnosisCode: 'K01.0',
      diagnosisDescription: 'Dientes incluidos',
      anatomicalZone: '16, 14, 16, Q1',
      quantity: 1,
      unitPrice: 100000,
    }),
  ]

  const [line] = buildBudgetFromTreatmentPlan(plan)
  assert.equal(line.quantity, 1)
  assert.equal(line.unitPrice, 100000)
  assert.equal(line.toothNumber, undefined)
})

test('un cambio de precio en el plan actualiza la fila ya vinculada', () => {
  const original = planItem({
    id: 'caries-16',
    procedure: 'Obturación',
    anatomicalZone: '16',
    unitPrice: 100000,
  })
  const [line] = buildBudgetFromTreatmentPlan([original])
  const updated = buildBudgetFromTreatmentPlan([{ ...original, unitPrice: 180000 }], [line])
  assert.equal(updated.length, 1)
  assert.equal(updated[0].id, line.id)
  assert.equal(updated[0].unitPrice, 180000)
})

test('conserva un procedimiento agregado solo en el presupuesto', () => {
  const manual = {
    id: 'manual-1',
    procedure: 'Profilaxis',
    quantity: 1,
    unitPrice: 80000,
    source: 'manual',
  }
  const plan = [
    planItem({
      id: 'caries-16',
      procedure: 'Obturación',
      unitPrice: 100000,
    }),
  ]
  const lines = buildBudgetFromTreatmentPlan(plan, [manual])
  assert.deepEqual(
    lines.map((line) => line.procedure),
    ['Profilaxis', 'Obturación'],
  )
})

test('si el plan solo trae ortodoncia, el aviso no dice que los procedimientos ya están', () => {
  const plan = [
    planItem({
      id: 'ortho',
      procedure: 'Ortodoncia Convencional con Brackets',
      unitPrice: 2200000,
      source: 'orthodontics_annex',
    }),
  ]
  const lines = buildBudgetFromTreatmentPlan(plan)
  assert.equal(lines.length, 0)
  assert.equal(
    treatmentPlanBudgetImportNotice(plan, [], lines),
    'El tratamiento de ortodoncia ya está en el presupuesto de ortodoncia.',
  )
})
