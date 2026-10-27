import assert from 'node:assert/strict'
import test from 'node:test'
import {
  emptyManualSharedEntry,
  importableSectionProcedures,
  orthodonticsSelectionOptions,
  prepareSharedDocument,
  sharedEntryFromOrthodontics,
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

const orthoBudget = {
  active: true,
  initialInstallment: { quantity: 1, unitPrice: 400000 },
  controls: { quantity: 3, unitPrice: 80000 },
  retainers: { quantity: 2, unitPrice: 150000 },
}

test('la caja ofrece pagar de contado, la cuota inicial, un control y los retenedores', () => {
  const options = orthodonticsSelectionOptions({ budget: orthoBudget, payments: [] })
  assert.deepEqual(
    options.map((item) => item.label),
    [
      'Pagar el tratamiento de contado',
      'Pagar la cuota inicial',
      'Pagar un control',
      'Pagar retenedores',
    ],
  )
  assert.equal(options[0].remaining, 940000)
  assert.equal(options[1].remaining, 400000)
  assert.equal(options[2].remaining, 80000)
  assert.equal(options[2].cupsCode, '893106')
  assert.equal(options[2].controlNumber, 1)
  assert.equal(options[3].remaining, 300000)
  assert.equal(options.every((item) => item.available), true)
})

test('sin presupuesto de ortodoncia los cuatro ítems siguen disponibles para indicar el valor', () => {
  const options = orthodonticsSelectionOptions({ budget: { ...orthoBudget, active: false } })
  assert.equal(options.length, 4)
  assert.equal(options.every((item) => item.available && item.cap == null), true)
})

test('un control ya pagado sugiere el siguiente y el contado no se mezcla con la cuota', () => {
  const payments = [{ paymentType: 'control', amount: 80000, controlNumber: 1 }]
  const options = orthodonticsSelectionOptions({ budget: orthoBudget, payments })
  assert.equal(options.find((item) => item.kind === 'control').controlNumber, 2)
  assert.equal(options.find((item) => item.kind === 'pago_unico').remaining, 860000)

  const blocked = orthodonticsSelectionOptions({
    budget: orthoBudget,
    payments,
    takenKinds: ['cuota_inicial'],
    reservedAmount: 400000,
  })
  const contado = blocked.find((item) => item.kind === 'pago_unico')
  assert.equal(contado.available, false)
  assert.match(contado.unavailableReason, /Quite la cuota/)
})

test('una resina y la cuota inicial comparten el comprobante sin crear otra fila clínica', () => {
  const lines = [line('a', 'Resina', 80000, '232101')]
  const cuota = sharedEntryFromOrthodontics(
    orthodonticsSelectionOptions({ budget: orthoBudget }).find((item) => item.kind === 'cuota_inicial'),
  )
  const prepared = prepareSharedDocument({
    entries: [
      sharedEntryFromSection({ lineId: 'a', procedure: 'Resina', cupsCode: '232101', remaining: 80000 }),
      cuota,
    ],
    documentKind: 'recibo_interno',
    lines,
    payments: [],
    orthodontics: { budget: orthoBudget, payments: [] },
  })

  assert.equal(prepared.ok, true)
  if (!prepared.ok) return
  assert.equal(prepared.document.total, 480000)
  assert.equal(prepared.document.newLines.length, 0)
  assert.equal(prepared.document.orthodonticsCharges.length, 1)
  assert.equal(prepared.document.orthodonticsCharges[0].paymentType, 'cuota_inicial')
  assert.equal(prepared.document.orthodonticsCharges[0].amount, 400000)
  assert.equal(prepared.document.orthodonticsCharges[0].paymentReason, 'Cuota inicial — ortodoncia')
  assert.equal(prepared.document.rows.filter((row) => row.orthodontics).length, 1)
  assert.equal(prepared.document.rows.find((row) => !row.orthodontics).line.id, 'a')
})

test('cuota y un control salen juntos y el contado no se combina con ellos', () => {
  const options = orthodonticsSelectionOptions({ budget: orthoBudget })
  const cuota = sharedEntryFromOrthodontics(options.find((item) => item.kind === 'cuota_inicial'))
  const control = sharedEntryFromOrthodontics(options.find((item) => item.kind === 'control'))
  const together = prepareSharedDocument({
    entries: [cuota, control],
    documentKind: 'factura',
    lines: [],
    payments: [],
    orthodontics: { budget: orthoBudget, payments: [] },
  })
  assert.equal(together.ok, true)
  if (!together.ok) return
  assert.equal(together.document.newLines.length, 0)
  assert.deepEqual(
    together.document.orthodonticsCharges.map((charge) => [charge.paymentType, charge.amount, charge.controlNumber]),
    [
      ['cuota_inicial', 400000, undefined],
      ['control', 80000, 1],
    ],
  )
  assert.equal(together.document.rows[1].line.cupsCode, '893106')

  const contado = sharedEntryFromOrthodontics(options.find((item) => item.kind === 'pago_unico'))
  const mixed = prepareSharedDocument({
    entries: [contado, cuota],
    documentKind: 'recibo_interno',
    lines: [],
    payments: [],
    orthodontics: { budget: orthoBudget, payments: [] },
  })
  assert.equal(mixed.ok, false)
  if (mixed.ok) return
  assert.match(mixed.message, /no se combina/)
})

test('un cobro de ortodoncia no puede pasar el saldo del concepto', () => {
  const cuota = sharedEntryFromOrthodontics(
    orthodonticsSelectionOptions({ budget: orthoBudget }).find((item) => item.kind === 'cuota_inicial'),
  )
  cuota.amount = 500000
  const prepared = prepareSharedDocument({
    entries: [
      cuota,
      { ...emptyManualSharedEntry(), procedure: 'Profilaxis', amount: 40000 },
    ],
    documentKind: 'recibo_interno',
    lines: [],
    payments: [],
    orthodontics: { budget: orthoBudget, payments: [] },
  })
  assert.equal(prepared.ok, false)
  if (prepared.ok) return
  assert.match(prepared.message, /supera el saldo de ortodoncia/)
})
