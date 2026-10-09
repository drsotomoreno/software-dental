import assert from 'node:assert/strict'
import {
  importTreatmentPlanIntoBudget,
  syncPaymentPlanWithBudget,
} from './budget'
import { importBudgetLinesIntoPaymentControl } from './paymentControlLines'
import { importBudgetIntoPaymentSection } from './paymentSectionMerge'
import { isSameTreatment, skippedTreatmentsMessage } from './treatmentIdentity'
import type {
  BudgetLineItem,
  PaymentControlLine,
  PaymentPlanItem,
  TreatmentPlanItem,
} from '@/types/clinicalRecord'

function planItem(patch: Partial<TreatmentPlanItem> & Pick<TreatmentPlanItem, 'id' | 'procedure'>): TreatmentPlanItem {
  return {
    phase: 'fase_ii',
    quantity: 1,
    unitPrice: 100000,
    patientApproved: 'pendiente',
    executionStatus: 'pendiente',
    ...patch,
  }
}

function budgetLine(patch: Partial<BudgetLineItem> & Pick<BudgetLineItem, 'id' | 'procedure'>): BudgetLineItem {
  return {
    quantity: 1,
    unitPrice: 80000,
    ...patch,
  }
}

function controlLine(
  patch: Partial<PaymentControlLine> & Pick<PaymentControlLine, 'id' | 'procedure'>,
): PaymentControlLine {
  return {
    quantity: 1,
    unitPrice: 80000,
    source: 'manual',
    ...patch,
  }
}

assert.equal(
  isSameTreatment(
    { procedure: 'Obturación', cupsCode: '232102', toothNumber: 16 },
    { procedure: 'Resina', cupsCode: '23.2.1.02', toothNumber: 16 },
  ),
  true,
)

assert.equal(
  isSameTreatment(
    { procedure: 'Obturación', cupsCode: '232102', toothNumber: 16 },
    { procedure: 'Obturación', cupsCode: '232102', toothNumber: 26 },
  ),
  false,
)

assert.equal(
  isSameTreatment(
    { procedure: 'Profilaxis', anatomicalZone: 'General' },
    { procedure: 'profilaxis' },
  ),
  true,
)

assert.equal(
  isSameTreatment(
    { procedure: 'Obturación', cupsCode: '232102', toothNumber: 16 },
    { procedure: 'Obturación', cupsCode: '232101', toothNumber: 16 },
  ),
  false,
)

const plan = [
  planItem({ id: 'p1', procedure: 'Obturación dental', cupsCode: '232102', toothNumber: 16 }),
  planItem({ id: 'p2', procedure: 'Otra obturación', cupsCode: '232102', toothNumber: 16, unitPrice: 50000 }),
  planItem({ id: 'p3', procedure: 'Obturación dental', cupsCode: '232102', toothNumber: 26 }),
]

const firstImport = importTreatmentPlanIntoBudget(plan, [])
assert.equal(firstImport.items.length, 2)
assert.equal(firstImport.skippedDuplicates, 1)
assert.equal(firstImport.items[0]?.toothNumber, 16)
assert.equal(firstImport.items[1]?.toothNumber, 26)

const secondImport = importTreatmentPlanIntoBudget(plan, firstImport.items)
assert.equal(secondImport.items.length, 2)
assert.equal(secondImport.skippedDuplicates, 3)
assert.equal(secondImport.items, firstImport.items)
assert.match(skippedTreatmentsMessage(3, 'el presupuesto') ?? '', /no se agregaron otra vez/)

const manualBudget = [
  budgetLine({
    id: 'b-manual',
    procedure: 'Obturación dental',
    cupsCode: '232102',
    toothNumber: 16,
  }),
]
const linked = importTreatmentPlanIntoBudget(plan, manualBudget)
assert.equal(linked.items.length, 2)
assert.equal(linked.items[0]?.id, 'b-manual')
assert.equal(linked.items[0]?.treatmentPlanItemId, 'p1')
assert.equal(linked.skippedDuplicates, 2)

const existingControl = [
  controlLine({
    id: 'c1',
    procedure: 'Obturación dental',
    cupsCode: '232102',
    toothNumber: 16,
  }),
]
const paymentImport = importBudgetLinesIntoPaymentControl(
  [
    budgetLine({
      id: 'b1',
      procedure: 'Obturación dental',
      cupsCode: '232102',
      toothNumber: 16,
      unitPrice: 90000,
    }),
    budgetLine({
      id: 'b2',
      procedure: 'Obturación dental',
      cupsCode: '232102',
      toothNumber: 26,
    }),
  ],
  [],
  existingControl,
)
assert.equal(paymentImport.lines.length, 2)
assert.equal(paymentImport.skippedDuplicates, 1)
assert.equal(paymentImport.lines[0]?.budgetItemId, 'b1')
assert.equal(paymentImport.lines[1]?.toothNumber, 26)

const again = importBudgetLinesIntoPaymentControl(
  [
    budgetLine({ id: 'b1', procedure: 'Obturación dental', cupsCode: '232102', toothNumber: 16 }),
    budgetLine({ id: 'b2', procedure: 'Obturación dental', cupsCode: '232102', toothNumber: 26 }),
  ],
  [],
  paymentImport.lines,
)
assert.equal(again.lines.length, 2)
assert.equal(again.skippedDuplicates, 2)

const planRows = syncPaymentPlanWithBudget(
  [
    budgetLine({ id: 'b1', procedure: 'Obturación dental', cupsCode: '232102', toothNumber: 16 }),
    budgetLine({ id: 'b1b', procedure: 'Obturación dental', cupsCode: '232102', toothNumber: 16, unitPrice: 1000 }),
    budgetLine({ id: 'b2', procedure: 'Obturación dental', cupsCode: '232102', toothNumber: 26 }),
    budgetLine({ id: 'b3', procedure: 'Implantes — Colocación', unitPrice: 400000 }),
  ],
  [
    {
      id: 'manual-1',
      procedure: 'Obturación dental',
      cupsCode: '232102',
      totalAmount: 1,
      paymentMethod: 'cuotas',
      installments: 3,
      scheduleNotes: 'conservar',
    } satisfies PaymentPlanItem,
  ],
  undefined,
  {
    active: true,
    implantPlacement: { quantity: 1, unitPrice: 400000 },
    prosthetics: { quantity: 0, unitPrice: 0 },
  },
)

const obturations = planRows.filter((row) => row.procedure === 'Obturación dental')
assert.equal(obturations.length, 2)
assert.equal(obturations[0]?.id, 'manual-1')
assert.equal(obturations[0]?.budgetItemId, 'b1')
assert.equal(obturations[0]?.installments, 3)
const implantRows = planRows.filter((row) => row.procedure === 'Implantes — Colocación')
assert.equal(implantRows.length, 1)

const section = importBudgetIntoPaymentSection({
  budgetItems: [
    budgetLine({ id: 'b1', procedure: 'Obturación dental', cupsCode: '232102', toothNumber: 16 }),
  ],
  treatmentPlan: [],
  lines: existingControl,
  plan: [],
})
assert.equal(section.lines.length, 1)
assert.equal(section.skippedDuplicates, 1)
assert.equal(section.plan.length, 1)
assert.equal(section.plan[0]?.budgetItemId, 'b1')

console.log('treatment identity checks passed')
