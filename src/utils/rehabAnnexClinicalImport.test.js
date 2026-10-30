import assert from 'node:assert/strict'
import test from 'node:test'
import {
  collectGroupedRehabBudgetLines,
  isLegacyPerToothRehabBudgetLine,
  mergeAnnexImportsIntoTreatmentPlan,
  syncRehabPlanItemsIntoGeneralBudget,
} from './rehabAnnexClinicalImport.ts'

test('detecta filas legacy diente a diente del presupuesto de rehab', () => {
  assert.equal(
    isLegacyPerToothRehabBudgetLine({
      procedure: 'Carilla Dental — pieza 13',
      importKey: 'visual:13:carilla',
    }),
    true,
  )
  assert.equal(
    isLegacyPerToothRehabBudgetLine({
      procedure: 'Carilla Dental',
      importKey: 'summary:carilla',
    }),
    false,
  )
})

test('si solo hay visual: las agrupa por tratamiento como la caja resumida', () => {
  const grouped = collectGroupedRehabBudgetLines([
    {
      id: 'v1',
      procedure: 'Carilla Dental — pieza 11',
      toothNumber: 11,
      anatomicalZone: '11',
      quantity: 1,
      unitPrice: 0,
      source: 'import',
      importKey: 'visual:11:carilla',
      paymentMethod: 'contado',
      scheduleNotes: '',
    },
    {
      id: 'v2',
      procedure: 'Carilla Dental — pieza 12',
      toothNumber: 12,
      anatomicalZone: '12',
      quantity: 1,
      unitPrice: 0,
      source: 'import',
      importKey: 'visual:12:carilla',
      paymentMethod: 'contado',
      scheduleNotes: '',
    },
    {
      id: 'v3',
      procedure: 'Pilar de PPF — pieza 14',
      toothNumber: 14,
      anatomicalZone: '14',
      quantity: 1,
      unitPrice: 50_000,
      source: 'import',
      importKey: 'visual:14:pilar_ppf',
      paymentMethod: 'contado',
      scheduleNotes: '',
    },
  ])

  assert.equal(grouped.length, 2)
  const carilla = grouped.find((line) => line.importKey === 'summary:carilla')
  const pilar = grouped.find((line) => line.importKey === 'summary:pilar_ppf')
  assert.ok(carilla)
  assert.ok(pilar)
  assert.equal(carilla.anatomicalZone, '11, 12')
  assert.equal(carilla.quantity, 2)
  assert.equal(carilla.procedure, 'Carilla Dental')
  assert.equal(pilar.anatomicalZone, '14')
  assert.equal(pilar.quantity, 1)
})

test('si ya existe summary: ignora las filas visual:', () => {
  const grouped = collectGroupedRehabBudgetLines([
    {
      id: 'v1',
      procedure: 'Carilla Dental — pieza 11',
      toothNumber: 11,
      anatomicalZone: '11',
      quantity: 1,
      unitPrice: 0,
      source: 'import',
      importKey: 'visual:11:carilla',
      paymentMethod: 'contado',
      scheduleNotes: '',
    },
    {
      id: 's1',
      procedure: 'Carilla Dental',
      anatomicalZone: '11, 12, 13',
      quantity: 3,
      unitPrice: 1_000_000,
      source: 'import',
      importKey: 'summary:carilla',
      paymentMethod: 'contado',
      scheduleNotes: '',
    },
  ])

  assert.equal(grouped.length, 1)
  assert.equal(grouped[0].importKey, 'summary:carilla')
  assert.equal(grouped[0].quantity, 3)
  assert.equal(grouped[0].unitPrice, 1_000_000)
})

test('sincroniza el plan agrupado al presupuesto y quita filas diente a diente', () => {
  const result = syncRehabPlanItemsIntoGeneralBudget(
    [
      {
        id: 'plan-carilla',
        phase: 'fase_iii',
        procedure: 'Carilla Dental',
        anatomicalZone: '11, 12, 13',
        quantity: 3,
        unitPrice: 1_000_000,
        patientApproved: 'pendiente',
        executionStatus: 'pendiente',
        source: 'rehabilitation_annex',
      },
    ],
    [
      {
        id: 'old-1',
        procedure: 'Carilla Dental — pieza 11',
        toothNumber: 11,
        quantity: 1,
        unitPrice: 0,
        source: 'treatment_plan',
      },
      {
        id: 'keep',
        procedure: 'Limpieza',
        quantity: 1,
        unitPrice: 80_000,
        source: 'manual',
      },
    ],
    (items) => ({
      subtotal: items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0),
      discount: 0,
      total: items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0),
      currency: 'COP',
    }),
  )

  assert.equal(result.budgetItems.length, 2)
  assert.ok(result.budgetItems.some((item) => item.procedure === 'Limpieza'))
  const carilla = result.budgetItems.find((item) => item.procedure === 'Carilla Dental')
  assert.ok(carilla)
  assert.equal(carilla.quantity, 3)
  assert.equal(carilla.unitPrice, 1_000_000)
  assert.equal(carilla.source, 'rehabilitation_annex')
})

test('conserva procedimiento y CUPS editados en presupuesto §8 al resincronizar', () => {
  const result = syncRehabPlanItemsIntoGeneralBudget(
    [
      {
        id: 'plan-pilar',
        phase: 'fase_iii',
        procedure: 'Pilar de PPF',
        anatomicalZone: '11, 12, 13',
        quantity: 3,
        unitPrice: 0,
        patientApproved: 'pendiente',
        executionStatus: 'pendiente',
        source: 'rehabilitation_annex',
      },
      {
        id: 'plan-pontico',
        phase: 'fase_iii',
        procedure: 'Póntico de PPF',
        anatomicalZone: '21, 22, 23',
        quantity: 3,
        unitPrice: 0,
        patientApproved: 'pendiente',
        executionStatus: 'pendiente',
        source: 'rehabilitation_annex',
      },
    ],
    [
      {
        id: 'budget-pilar',
        treatmentPlanItemId: 'plan-pilar',
        procedure: 'Corona metal cerámica',
        cupsCode: '997207',
        anatomicalZone: '11, 12, 13',
        quantity: 3,
        unitPrice: 450_000,
        source: 'rehabilitation_annex',
      },
      {
        id: 'budget-pontico',
        treatmentPlanItemId: 'plan-pontico',
        procedure: 'Póntico de PPF',
        cupsCode: '233101',
        anatomicalZone: '21, 22, 23',
        quantity: 3,
        unitPrice: 0,
        source: 'rehabilitation_annex',
      },
    ],
    (items) => ({
      subtotal: items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0),
      discount: 0,
      total: items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0),
      currency: 'COP',
    }),
  )

  assert.equal(result.budgetItems.length, 2)
  const pilar = result.budgetItems.find((item) => item.treatmentPlanItemId === 'plan-pilar')
  const pontico = result.budgetItems.find((item) => item.treatmentPlanItemId === 'plan-pontico')
  assert.ok(pilar)
  assert.ok(pontico)
  assert.equal(pilar.procedure, 'Corona metal cerámica')
  assert.equal(pilar.cupsCode, '997207')
  assert.equal(pilar.unitPrice, 450_000)
  assert.equal(pontico.procedure, 'Póntico de PPF')
  assert.equal(pontico.cupsCode, '233101')
})

test('al importar rehab reemplaza las filas — pieza por la caja resumida', () => {
  const plan = [
    {
      id: 'legacy-1',
      phase: 'fase_iii',
      procedure: 'Carilla Dental — pieza 11',
      toothNumber: 11,
      anatomicalZone: '11',
      quantity: 1,
      unitPrice: 0,
      patientApproved: 'pendiente',
      executionStatus: 'pendiente',
      source: 'rehabilitation_annex',
    },
    {
      id: 'ortho',
      phase: 'fase_ii',
      procedure: 'Ortodoncia Convencional',
      anatomicalZone: 'General',
      quantity: 1,
      unitPrice: 0,
      patientApproved: 'pendiente',
      executionStatus: 'pendiente',
      source: 'orthodontics_annex',
    },
  ]

  const chosen = [
    {
      id: 'sum-carilla',
      phase: 'fase_iii',
      procedure: 'Carilla Dental',
      anatomicalZone: '11, 12, 13, 21, 22, 23',
      quantity: 6,
      unitPrice: 1_000_000,
      patientApproved: 'pendiente',
      executionStatus: 'pendiente',
      source: 'rehabilitation_annex',
    },
  ]

  const merged = mergeAnnexImportsIntoTreatmentPlan(plan, chosen)
  assert.equal(merged.length, 2)
  assert.ok(merged.some((item) => item.source === 'orthodontics_annex'))
  assert.ok(merged.every((item) => !/pieza\s+\d/i.test(item.procedure)))
  const carilla = merged.find((item) => item.procedure === 'Carilla Dental')
  assert.ok(carilla)
  assert.equal(carilla.quantity, 6)
})
