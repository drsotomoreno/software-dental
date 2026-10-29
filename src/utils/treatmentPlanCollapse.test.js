import assert from 'node:assert/strict'
import test from 'node:test'
import {
  collapseTreatmentPlanByProcedure,
  collectTreatmentPlanItemTeeth,
  stripTreatmentProcedureNoise,
  treatmentProcedureFamilyKey,
} from './treatmentPlanCollapse.ts'

test('agrupa carillas por pieza y la fila resumen en una sola zona', () => {
  const collapsed = collapseTreatmentPlanByProcedure([
    {
      id: 'a',
      phase: 'fase_iii',
      procedure: 'Carilla Dental — pieza 13',
      toothNumber: 13,
      anatomicalZone: '13',
      quantity: 1,
      unitPrice: 0,
      patientApproved: 'pendiente',
      executionStatus: 'pendiente',
      source: 'rehabilitation_annex',
    },
    {
      id: 'b',
      phase: 'fase_iii',
      procedure: 'Carilla Dental — pieza 21',
      toothNumber: 21,
      anatomicalZone: '21',
      quantity: 1,
      unitPrice: 0,
      patientApproved: 'pendiente',
      executionStatus: 'pendiente',
      source: 'rehabilitation_annex',
    },
    {
      id: 'c',
      phase: 'fase_iii',
      procedure: 'Carilla Dental',
      anatomicalZone: '11, 12, 13, 21, 22, 23',
      quantity: 6,
      unitPrice: 1_000_000,
      patientApproved: 'pendiente',
      executionStatus: 'pendiente',
      source: 'rehabilitation_annex',
      notes: 'importKey:summary:carilla',
    },
  ])

  assert.equal(collapsed.length, 1)
  assert.equal(collapsed[0].procedure, 'Carilla Dental')
  assert.equal(collapsed[0].unitPrice, 1_000_000)
  assert.deepEqual(collectTreatmentPlanItemTeeth(collapsed[0]), [11, 12, 13, 21, 22, 23])
})

test('deja individual cuando el tratamiento solo aplica a un diente', () => {
  const collapsed = collapseTreatmentPlanByProcedure([
    {
      id: 'solo',
      phase: 'fase_iii',
      procedure: 'Pilar de PPF — pieza 24',
      toothNumber: 24,
      anatomicalZone: '24',
      quantity: 1,
      unitPrice: 200_000,
      patientApproved: 'pendiente',
      executionStatus: 'pendiente',
      source: 'rehabilitation_annex',
    },
  ])

  assert.equal(collapsed.length, 1)
  assert.equal(collapsed[0].procedure, 'Pilar de PPF')
  assert.equal(collapsed[0].toothNumber, 24)
  assert.equal(collapsed[0].anatomicalZone, '24')
  assert.equal(collapsed[0].quantity, 1)
})

test('une variantes de nombre de carilla (catálogo + rehab)', () => {
  assert.equal(
    treatmentProcedureFamilyKey('99.7.2.07 — Carilla estética indirecta'),
    'rehab:carilla',
  )
  assert.equal(treatmentProcedureFamilyKey('Carilla Dental Indirecta'), 'rehab:carilla')
  assert.equal(stripTreatmentProcedureNoise('Carilla Dental — pieza 13'), 'Carilla Dental')

  const collapsed = collapseTreatmentPlanByProcedure([
    {
      id: 'cie',
      phase: 'fase_iii',
      procedure: '99.7.2.07 — Carilla estética indirecta',
      toothNumber: 11,
      anatomicalZone: '11',
      quantity: 1,
      unitPrice: 1_000_000,
      patientApproved: 'pendiente',
      executionStatus: 'pendiente',
      source: 'manual',
    },
    {
      id: 'group',
      phase: 'fase_iii',
      procedure: 'Carilla Dental',
      anatomicalZone: '11, 12, 13',
      quantity: 3,
      unitPrice: 1_000_000,
      patientApproved: 'pendiente',
      executionStatus: 'pendiente',
      source: 'rehabilitation_annex',
    },
  ])

  assert.equal(collapsed.length, 1)
  assert.deepEqual(collectTreatmentPlanItemTeeth(collapsed[0]), [11, 12, 13])
})

test('no fusiona filas vacías al agregar procedimientos nuevos', () => {
  const collapsed = collapseTreatmentPlanByProcedure([
    {
      id: 'blank-1',
      phase: 'fase_ii',
      procedure: '',
      quantity: 1,
      unitPrice: 0,
      patientApproved: 'pendiente',
      executionStatus: 'pendiente',
      source: 'manual',
    },
    {
      id: 'blank-2',
      phase: 'fase_ii',
      procedure: '',
      quantity: 1,
      unitPrice: 0,
      patientApproved: 'pendiente',
      executionStatus: 'pendiente',
      source: 'manual',
    },
  ])

  assert.equal(collapsed.length, 2)
})

test('agrupa pilares y pónticos por separado', () => {
  const collapsed = collapseTreatmentPlanByProcedure([
    {
      id: 'p1',
      phase: 'fase_iii',
      procedure: 'Pilar de PPF — pieza 14',
      toothNumber: 14,
      quantity: 1,
      unitPrice: 0,
      patientApproved: 'pendiente',
      executionStatus: 'pendiente',
    },
    {
      id: 'p2',
      phase: 'fase_iii',
      procedure: 'Pilar de PPF — pieza 16',
      toothNumber: 16,
      quantity: 1,
      unitPrice: 0,
      patientApproved: 'pendiente',
      executionStatus: 'pendiente',
    },
    {
      id: 'po1',
      phase: 'fase_iii',
      procedure: 'Póntico de PPF — pieza 15',
      toothNumber: 15,
      quantity: 1,
      unitPrice: 0,
      patientApproved: 'pendiente',
      executionStatus: 'pendiente',
    },
    {
      id: 'summary-pilar',
      phase: 'fase_iii',
      procedure: 'Pilar de PPF',
      anatomicalZone: '14, 16, 24',
      quantity: 3,
      unitPrice: 461_538,
      patientApproved: 'pendiente',
      executionStatus: 'pendiente',
    },
  ])

  assert.equal(collapsed.length, 2)
  const pilar = collapsed.find((item) => item.procedure === 'Pilar de PPF')
  const pontico = collapsed.find((item) => item.procedure === 'Póntico de PPF')
  assert.ok(pilar)
  assert.ok(pontico)
  assert.deepEqual(collectTreatmentPlanItemTeeth(pilar), [14, 16, 24])
  assert.equal(pilar.unitPrice, 461_538)
  assert.equal(pontico.toothNumber, 15)
})
