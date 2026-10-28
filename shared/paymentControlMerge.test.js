import assert from 'node:assert/strict'
import test from 'node:test'
import {
  dropsPaymentRecords,
  mergePaymentRecords,
  paymentControlHasContent,
  withMergedClinicalPayments,
} from './paymentControlMerge.js'

test('la unión por id conserva abonos de ambas terminales', () => {
  const terminalA = [
    { id: 'p1', amount: 1_000_000, paymentDate: '2026-08-11', invoices: [] },
    { id: 'p2', amount: 2_000_000, paymentDate: '2026-08-16', invoices: [] },
    { id: 'p3', amount: 3_000_000, paymentDate: '2026-08-28', invoices: [] },
  ]
  const terminalB = [
    ...terminalA,
    {
      id: 'p4',
      amount: 3_000_000,
      paymentDate: '2026-10-10',
      paymentControlLineId: 'line-rehab',
      invoices: [{ invoiceNumber: 'RC-1', amount: 3_000_000 }],
    },
    {
      id: 'p5',
      amount: 4_000_000,
      paymentDate: '2026-10-26',
      paymentControlLineId: 'line-rehab',
      invoices: [{ invoiceNumber: 'RC-2', amount: 4_000_000 }],
    },
  ]

  const merged = mergePaymentRecords(terminalA, terminalB)
  assert.equal(merged.length, 5)
  assert.ok(merged.some((payment) => payment.id === 'p4'))
  assert.ok(merged.some((payment) => payment.id === 'p5'))
})

test('un autoguardado incompleto no borra recibos que la otra terminal ya tenía', () => {
  const complete = {
    clinicalDraft: {
      anamnesis: { chiefComplaint: 'Rehabilitación' },
      paymentControl: [
        { id: 'a', amount: 1_000_000, paymentDate: '2026-08-11', invoices: [] },
        {
          id: 'b',
          amount: 4_000_000,
          paymentDate: '2026-10-26',
          paymentControlLineId: 'line-1',
          invoices: [{ invoiceNumber: 'RC-9', amount: 4_000_000 }],
        },
      ],
      paymentControlLines: [{ id: 'line-1', procedure: 'rehabilitación', unitPrice: 20_000_000 }],
    },
  }
  const staleAutosave = {
    clinicalDraft: {
      anamnesis: { chiefComplaint: 'Rehabilitación' },
      paymentControl: [
        { id: 'a', amount: 1_000_000, paymentDate: '2026-08-11', invoices: [] },
      ],
      paymentControlLines: [{ id: 'line-1', procedure: 'rehabilitación', unitPrice: 20_000_000 }],
      paymentPlan: [{ id: 'plan-1', installmentAmount: 3_000_000 }],
    },
    updatedAt: '2026-10-28T20:00:00.000Z',
  }

  const winner = withMergedClinicalPayments(staleAutosave, complete)
  assert.equal(winner.clinicalDraft.paymentControl.length, 2)
  assert.ok(winner.clinicalDraft.paymentControl.some((payment) => payment.id === 'b'))
  assert.equal(
    winner.clinicalDraft.paymentControl.find((payment) => payment.id === 'b').paymentControlLineId,
    'line-1',
  )
})

test('entre dos copias del mismo abono gana la que tiene factura y vínculo', () => {
  const plain = {
    id: 'same',
    amount: 1_000_000,
    paymentDate: '2026-08-11',
    invoices: [],
  }
  const richer = {
    id: 'same',
    amount: 1_000_000,
    paymentDate: '2026-08-11',
    paymentControlLineId: 'line-1',
    invoices: [{ invoiceNumber: 'RC-1', amount: 1_000_000, cufe: '' }],
  }
  const merged = mergePaymentRecords([plain], [richer])
  assert.equal(merged.length, 1)
  assert.equal(merged[0].paymentControlLineId, 'line-1')
  assert.equal(merged[0].invoices[0].invoiceNumber, 'RC-1')
})

test('detecta cuando una copia pierde abonos de la otra', () => {
  const prev = {
    paymentControl: [{ id: 'keep', amount: 1 }, { id: 'lost', amount: 2 }],
  }
  const next = {
    paymentControl: [{ id: 'keep', amount: 1 }],
  }
  assert.equal(dropsPaymentRecords(prev, next), true)
  assert.equal(dropsPaymentRecords(next, prev), false)
  assert.equal(paymentControlHasContent(prev), true)
})
