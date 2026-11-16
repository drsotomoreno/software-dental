import assert from 'node:assert/strict'
import test from 'node:test'
import { mergeBudgetItems } from './clinicalBudgetMerge.js'
import { mergePaymentRecords } from './paymentControlMerge.js'
import {
  assertClinicalArrayLimits,
  ClinicalArrayCircuitError,
  sanitizeClinicalRecordArrays,
} from './clinicalSyncCircuitBreaker.js'
import { dedupeClinicalMoney, pickHealthyClinicalDraft, planIsabelRecovery } from '../scripts/recover-isabel.mjs'

test('unir un presupuesto consigo mismo 5000 veces deja las líneas únicas', () => {
  const unique = [
    { id: 'b1', procedure: 'Resina', toothNumber: 35, unitPrice: 100000, quantity: 1, cupsCode: '232102' },
    { id: 'b2', procedure: 'Amalgama', toothNumber: 21, unitPrice: 99999, quantity: 1, cupsCode: '232101' },
    { id: 'b3', procedure: 'Resina', toothNumber: 34, unitPrice: 0, quantity: 1, cupsCode: '232102' },
    { id: 'b4', procedure: 'Alineadores', unitPrice: 2099999, quantity: 1 },
    { id: 'b5', procedure: 'Endodoncia', toothNumber: 16, unitPrice: 500000, quantity: 1 },
    { id: 'b6', procedure: 'Resina fotocurado', toothNumber: 35, unitPrice: 100000, quantity: 1, cupsCode: '232102' },
  ]
  let pile = unique
  for (let i = 0; i < 5000; i += 1) pile = mergeBudgetItems(pile, unique)
  assert.equal(pile.length, 6)
})

test('un id extra con el mismo contenido no duplica el presupuesto', () => {
  const line = { id: 'b1', procedure: 'Resina', toothNumber: 35, unitPrice: 100000, quantity: 1, cupsCode: '232102' }
  const copy = { ...line, id: 'b1-copia' }
  const merged = mergeBudgetItems([line, line, line], [copy, copy])
  assert.equal(merged.length, 1)
})

test('abonos repetidos colapsan por id y por contenido', () => {
  const payment = { id: 'p1', amount: 50000, paymentDate: '2026-10-01', paymentControlLineId: 'l1' }
  const pile = Array.from({ length: 40 }, () => ({ ...payment }))
  pile.push({ ...payment, id: 'p1-copia' })
  assert.equal(mergePaymentRecords(pile, pile).length, 1)
})

test('el circuit breaker rechaza 301 presupuestos distintos y acepta el inflado ya deduplicado', () => {
  const distinct = Array.from({ length: 301 }, (_, index) => ({
    id: `b${index}`,
    procedure: `Procedimiento ${index}`,
    toothNumber: index,
    unitPrice: index + 1,
    quantity: 1,
  }))
  assert.throws(
    () => assertClinicalArrayLimits(null, { payload: { budgetItems: distinct } }),
    (error) => error instanceof ClinicalArrayCircuitError && error.status === 422,
  )

  const line = { id: 'b1', procedure: 'Resina', toothNumber: 35, unitPrice: 100000, quantity: 1 }
  const inflated = {
    syncId: 'rec',
    payload: { budgetItems: Array.from({ length: 23820 }, () => ({ ...line })) },
  }
  const sanitized = sanitizeClinicalRecordArrays(inflated)
  assert.equal(sanitized.payload.budgetItems.length, 1)
  assert.doesNotThrow(() => assertClinicalArrayLimits({ payload: { budgetItems: [line] } }, sanitized))
})

test('el rescate de Isabel deduplica, restaura el borrador sano y reactiva STL', () => {
  const healthy = {
    anamnesis: { chiefComplaint: 'dolor en el 35' },
    budgetItems: [{ id: 'b1', procedure: 'Resina', toothNumber: 35, unitPrice: 100000, quantity: 1 }],
    paymentControl: [{ id: 'p1', amount: 10000, paymentDate: '2026-10-01' }],
    evolutionNotes: [{ id: 'n1', date: '2026-09-29T13:48', procedure: 'Consulta', clinicalNote: 'control' }],
  }
  const repeatedBudget = Array.from({ length: 12 }, () => ({
    ...healthy.budgetItems[0],
  }))
  const store = {
    clinics: {
      'clinic:doctormauriciosoto@gmail.com': {
        patients: {
          '4a08b227-da3d-45f6-8325-a0ec906a45c9': {
            syncId: '4a08b227-da3d-45f6-8325-a0ec906a45c9',
            payload: {
              documentNumber: '37861325',
              firstName: 'isabel',
              lastName: 'De la Rosa',
              phase: 'TRATAMIENTO_ACEPTADO',
              treatmentCompleted: false,
            },
          },
        },
        clinicalRecords: {
          'e3a4df37-b719-424b-a952-da429c83d93d': {
            syncId: 'e3a4df37-b719-424b-a952-da429c83d93d',
            payload: {
              patientSyncId: '4a08b227-da3d-45f6-8325-a0ec906a45c9',
              signedAt: '2026-10-14T04:21:13.505Z',
              budgetItems: repeatedBudget,
              paymentControl: Array.from({ length: 9 }, () => ({ ...healthy.paymentControl[0] })),
              evolutionNotes: healthy.evolutionNotes,
            },
          },
        },
        drafts: {
          'draft:4a08b227-da3d-45f6-8325-a0ec906a45c9': {
            syncId: 'draft:4a08b227-da3d-45f6-8325-a0ec906a45c9',
            payload: {
              patientSyncId: '4a08b227-da3d-45f6-8325-a0ec906a45c9',
              clinicalDraft: null,
              valuationDraft: null,
            },
          },
        },
        diagnosticAids: {
          stl1: {
            syncId: 'stl1',
            deletedAt: '2026-11-14T17:02:44.092Z',
            payload: {
              patientSyncId: '4a08b227-da3d-45f6-8325-a0ec906a45c9',
              fileName: 'UpperJaw.stl',
              fileType: 'STL',
            },
          },
        },
        attachments: {},
      },
    },
  }
  const backup = {
    clinics: {
      alias: {
        drafts: {
          'draft:4a08b227-da3d-45f6-8325-a0ec906a45c9': {
            payload: { patientSyncId: '4a08b227-da3d-45f6-8325-a0ec906a45c9', clinicalDraft: healthy },
          },
        },
      },
    },
  }

  assert.equal(pickHealthyClinicalDraft([healthy]).anamnesis.chiefComplaint, 'dolor en el 35')
  const report = planIsabelRecovery(store, [backup])
  assert.equal(report.ok, true)
  assert.equal(report.after.signed.budget, 1)
  assert.equal(report.after.signed.payments, 1)
  assert.equal(report.after.signed.notes, 1)
  assert.equal(report.after.draft.budget, 1)
  assert.equal(report.after.stlReactivated, 1)
  assert.equal(report.patient.phase, 'TRATAMIENTO_ACEPTADO')
  assert.equal(store.clinics['clinic:doctormauriciosoto@gmail.com'].diagnosticAids.stl1.deletedAt, null)
  assert.equal(dedupeClinicalMoney(healthy).budgetItems.length, 1)
})
