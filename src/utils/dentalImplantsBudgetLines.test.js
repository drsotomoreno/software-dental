import assert from 'node:assert/strict'
import test from 'node:test'
import {
  dentalImplantsAnnexHasPlannedProcedures,
  dentalImplantsBudgetHasMonetaryValues,
  shouldShowDentalImplantsBudgetSection,
} from './dentalImplantsBudgetLines.ts'

test('oculta la caja si no hay plan ni presupuesto de implantes', () => {
  assert.equal(shouldShowDentalImplantsBudgetSection({ active: false }, null), false)
  assert.equal(shouldShowDentalImplantsBudgetSection(undefined, undefined), false)
  assert.equal(
    shouldShowDentalImplantsBudgetSection(
      {
        active: true,
        implantPlacement: { quantity: 1, unitPrice: 0 },
        prosthetics: { quantity: 0, unitPrice: 0 },
      },
      null,
    ),
    false,
  )
})

test('muestra la caja si hay montos reales o plan del anexo', () => {
  assert.equal(
    shouldShowDentalImplantsBudgetSection(
      {
        active: true,
        implantPlacement: { quantity: 2, unitPrice: 1_200_000 },
        prosthetics: { quantity: 2, unitPrice: 800_000 },
      },
      null,
    ),
    true,
  )
  assert.equal(
    shouldShowDentalImplantsBudgetSection(
      { active: false },
      {
        implantPlacementPlan: {
          implants: [{ id: '1', quadrant: 1, arch: 'upper', x: 0, y: 0 }],
        },
      },
    ),
    true,
  )
})

test('detecta montos y plan del anexo', () => {
  assert.equal(
    dentalImplantsBudgetHasMonetaryValues({
      active: true,
      implantPlacement: { quantity: 1, unitPrice: 100 },
      prosthetics: { quantity: 0, unitPrice: 0 },
    }),
    true,
  )
  assert.equal(
    dentalImplantsAnnexHasPlannedProcedures({
      visualTreatmentPlan: [{ id: 'v1' }],
    }),
    true,
  )
  assert.equal(dentalImplantsAnnexHasPlannedProcedures(null), false)
})
