import assert from 'node:assert/strict'
import test from 'node:test'
import {
  emptyManualSharedEntry,
  importableSectionProcedures,
  prepareSharedDocument,
  sharedEntryFromSection,
} from './sharedDocumentBox.ts'

function line(id, procedure, unitPrice, cupsCode) {
  return {
    id,
    procedure,
    cupsCode,
    quantity: 1,
    unitPrice,
    source: 'manual',
  }
}

test('la sección ofrece solo procedimientos con saldo que no están en la caja', () => {
  const lines = [
    line('a', 'Resina', 80000, '232101'),
    line('b', 'Detartraje', 50000, '997301'),
    line('c', '  ', 40000),
    line('d', 'Ya pagado', 30000, '232102'),
  ]
  const payments = [
    {
      id: 'p1',
      paymentControlLineId: 'd',
      paymentDate: '2026-10-01',
      amount: 30000,
      paymentMethod: 'contado',
      paymentReason: 'Ya pagado',
      invoices: [],
    },
  ]

  const options = importableSectionProcedures(lines, payments, ['b'])
  assert.deepEqual(
    options.map((item) => item.lineId),
    ['a'],
  )
  assert.equal(options[0].remaining, 80000)
})

test('dos procedimientos importados salen en un solo comprobante sin filas nuevas', () => {
  const lines = [line('a', 'Resina', 80000, '23.21.01'), line('b', 'Detartraje', 50000)]
  const imported = sharedEntryFromSection({
    lineId: 'a',
    procedure: 'Resina',
    cupsCode: '232101',
    remaining: 80000,
  })
  imported.amount = 30000
  const second = sharedEntryFromSection({
    lineId: 'b',
    procedure: 'Detartraje',
    remaining: 50000,
  })

  const prepared = prepareSharedDocument({
    entries: [imported, second],
    documentKind: 'factura',
    lines,
    payments: [],
  })

  assert.equal(prepared.ok, true)
  if (!prepared.ok) return
  assert.equal(prepared.document.documentKind, 'factura')
  assert.equal(prepared.document.total, 80000)
  assert.equal(prepared.document.newLines.length, 0)
  assert.deepEqual(
    prepared.document.rows.map((row) => [row.line.id, row.amount, row.line.cupsCode]),
    [
      ['a', 30000, '232101'],
      ['b', 50000, undefined],
    ],
  )
})

test('un procedimiento manual se crea en la sección y comparte el total con el importado', () => {
  const lines = [line('a', 'Resina', 80000, '232101')]
  const manual = emptyManualSharedEntry()
  manual.procedure = 'Blanqueamiento'
  manual.amount = 120000

  const prepared = prepareSharedDocument({
    entries: [
      sharedEntryFromSection({
        lineId: 'a',
        procedure: 'Resina',
        cupsCode: '232101',
        remaining: 80000,
      }),
      manual,
    ],
    documentKind: 'recibo_interno',
    lines,
    payments: [],
  })

  assert.equal(prepared.ok, true)
  if (!prepared.ok) return
  assert.equal(prepared.document.total, 200000)
  assert.equal(prepared.document.newLines.length, 1)
  assert.equal(prepared.document.newPlanItems.length, 1)
  const created = prepared.document.newLines[0]
  assert.equal(created.procedure, 'Blanqueamiento')
  assert.equal(created.unitPrice, 120000)
  assert.equal(created.source, 'manual')
  assert.equal(prepared.document.newPlanItems[0].paymentControlLineId, created.id)
  assert.equal(prepared.document.newPlanItems[0].totalAmount, 120000)
  assert.equal(prepared.document.rows[1].line.id, created.id)
})

test('un solo procedimiento, el saldo superado y el CUPS incompleto no arman el comprobante', () => {
  const lines = [line('a', 'Resina', 80000, '232101')]
  const alone = prepareSharedDocument({
    entries: [
      sharedEntryFromSection({ lineId: 'a', procedure: 'Resina', remaining: 80000 }),
    ],
    documentKind: 'recibo_interno',
    lines,
    payments: [],
  })
  assert.equal(alone.ok, false)

  const over = sharedEntryFromSection({ lineId: 'a', procedure: 'Resina', remaining: 80000 })
  over.amount = 90000
  const exceeded = prepareSharedDocument({
    entries: [over, { ...emptyManualSharedEntry(), procedure: 'Extra', amount: 1000 }],
    documentKind: 'recibo_interno',
    lines,
    payments: [],
  })
  assert.equal(exceeded.ok, false)
  if (exceeded.ok) return
  assert.match(exceeded.message, /supera el saldo/)

  const badCups = prepareSharedDocument({
    entries: [
      sharedEntryFromSection({ lineId: 'a', procedure: 'Resina', remaining: 80000 }),
      { ...emptyManualSharedEntry(), procedure: 'Extra', cupsCode: '12', amount: 1000 },
    ],
    documentKind: 'factura',
    lines,
    payments: [],
  })
  assert.equal(badCups.ok, false)
  if (badCups.ok) return
  assert.match(badCups.message, /CUPS/)
})
