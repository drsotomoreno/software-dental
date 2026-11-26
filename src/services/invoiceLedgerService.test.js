import assert from 'node:assert/strict'
import test from 'node:test'
import {
  dedupeInvoiceLedgerEntries,
  summarizeInvoiceLedger,
} from './invoiceLedgerMath.ts'

function entry(partial) {
  return {
    key: partial.key,
    invoice: partial.invoice ?? {
      id: partial.invoiceId ?? partial.key,
      invoiceNumber: partial.invoiceNumber,
      invoiceDate: partial.invoiceDate ?? '2026-11-20',
      amount: partial.amount ?? 0,
      status: partial.isVoided ? 'voided_by_credit_note' : 'active',
    },
    invoiceNumber: partial.invoiceNumber,
    invoiceDate: partial.invoiceDate ?? '2026-11-20',
    amount: partial.amount ?? 0,
    patientId: partial.patientId ?? '1',
    patientRouteId: partial.patientId ?? '1',
    patientName: 'Paciente',
    patientDocument: 'CC 1',
    paymentReason: 'Pago',
    paymentMethod: 'contado',
    paymentDate: partial.invoiceDate ?? '2026-11-20',
    source: partial.source ?? 'control_pagos',
    isDraft: Boolean(partial.isDraft),
    documentKind: partial.documentKind ?? null,
    isVoided: Boolean(partial.isVoided),
  }
}

test('dedupeInvoiceLedgerEntries prefiere la historia firmada sobre el borrador', () => {
  const entries = dedupeInvoiceLedgerEntries([
    entry({
      key: 'draft:p1:i1',
      invoiceId: 'i1',
      invoiceNumber: 'FV00000001',
      amount: 100000,
      documentKind: 'factura',
      isDraft: true,
      source: 'borrador',
    }),
    entry({
      key: 'rec:p1:i1',
      invoiceId: 'i1',
      invoiceNumber: 'FV00000001',
      amount: 100000,
      documentKind: 'factura',
      isDraft: false,
    }),
  ])

  assert.equal(entries.length, 1)
  assert.equal(entries[0].isDraft, false)
})

test('summarizeInvoiceLedger separa FEV, recibos y anuladas', () => {
  const summary = summarizeInvoiceLedger([
    entry({
      key: '1',
      invoiceNumber: 'FV00000001',
      amount: 200000,
      documentKind: 'factura',
    }),
    entry({
      key: '2',
      invoiceNumber: 'RC00000001',
      amount: 80000,
      documentKind: 'recibo_interno',
    }),
    entry({
      key: '3',
      invoiceNumber: 'FV00000002',
      amount: 50000,
      documentKind: 'factura',
      isVoided: true,
    }),
  ])

  assert.equal(summary.invoiceCount, 3)
  assert.equal(summary.fevCount, 1)
  assert.equal(summary.fevTotal, 200000)
  assert.equal(summary.receiptCount, 1)
  assert.equal(summary.receiptTotal, 80000)
  assert.equal(summary.voidedCount, 1)
  assert.equal(summary.voidedTotal, 50000)
  assert.equal(summary.activeTotal, 280000)
  assert.equal(summary.totalAmount, 330000)
})
