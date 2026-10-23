import assert from 'node:assert/strict'
import test from 'node:test'
import { validateAcceptTreatment } from './patientPhase.ts'
import { validateClinicalRecordDraft } from './validateClinicalRecordDraft.ts'

const MISSING_BUDGET_ITEM = 'Falta registrar al menos un ítem de presupuesto'

function readyDraft(overrides = {}) {
  return {
    anamnesis: { chiefComplaint: 'Apiñamiento' },
    diagnosticChart: { entries: [{ diagnosisCode: 'K070' }] },
    treatmentPlan: [{ procedure: 'Ortodoncia con brackets' }],
    budgetItems: [],
    ...overrides,
  }
}

test('un presupuesto de ortodoncia activo cuenta como ítem del presupuesto', () => {
  const issues = validateClinicalRecordDraft(
    readyDraft({
      orthodonticsBudget: {
        active: true,
        initialInstallment: { quantity: 1, unitPrice: 800000 },
        controls: { quantity: 12, unitPrice: 150000 },
        retainers: { quantity: 1, unitPrice: 200000 },
      },
    }),
  )

  assert.equal(issues.includes(MISSING_BUDGET_ITEM), false)
  assert.deepEqual(issues, [])
})

test('el presupuesto del anexo de ortodoncia cuenta aunque no haya fila general', () => {
  const issues = validateClinicalRecordDraft(
    readyDraft({
      orthodonticsBudget: {
        active: false,
        initialInstallment: { quantity: 1, unitPrice: 0 },
        controls: { quantity: 0, unitPrice: 0 },
        retainers: { quantity: 0, unitPrice: 0 },
      },
      specializedAnnexes: {
        orthodontics: {
          orthodonticBudget: {
            kind: 'standard',
            values: {
              initialPayment: 880000,
              monthlyControlsCount: 18,
              pricePerControl: 120000,
              retainerPrice: 250000,
            },
          },
        },
      },
    }),
  )

  assert.equal(issues.includes(MISSING_BUDGET_ITEM), false)
})

test('el presupuesto de implantes cuenta como parte de la misma unidad', () => {
  const issues = validateClinicalRecordDraft(
    readyDraft({
      dentalImplantsBudget: {
        active: true,
        implantPlacement: { quantity: 1, unitPrice: 1500000 },
        prosthetics: { quantity: 0, unitPrice: 0 },
      },
    }),
  )

  assert.equal(issues.includes(MISSING_BUDGET_ITEM), false)
})

test('el presupuesto activo del anexo de endodoncia cuenta como ítem', () => {
  const issues = validateClinicalRecordDraft(
    readyDraft({
      specializedAnnexes: {
        endodontics: {
          budget: {
            active: true,
            toothLines: [{ toothNumber: 16, unitPrice: 450000 }],
            notes: '',
          },
        },
      },
    }),
  )

  assert.equal(issues.includes(MISSING_BUDGET_ITEM), false)
})

test('sin filas ni presupuesto de anexo sigue pidiendo un ítem', () => {
  const issues = validateClinicalRecordDraft(
    readyDraft({
      orthodonticsBudget: {
        active: false,
        initialInstallment: { quantity: 1, unitPrice: 0 },
        controls: { quantity: 0, unitPrice: 0 },
        retainers: { quantity: 0, unitPrice: 0 },
      },
      specializedAnnexes: {
        orthodontics: {
          orthodonticBudget: {
            kind: 'standard',
            values: {
              initialPayment: 0,
              monthlyControlsCount: 0,
              pricePerControl: 0,
              retainerPrice: 0,
            },
          },
        },
        endodontics: {
          budget: { active: false, toothLines: [], notes: '' },
        },
      },
    }),
  )

  assert.deepEqual(issues, [MISSING_BUDGET_ITEM])
})

test('aceptar el tratamiento reconoce el presupuesto del anexo de ortodoncia', () => {
  const error = validateAcceptTreatment(
    readyDraft({
      specializedAnnexes: {
        orthodontics: {
          orthodonticBudget: {
            kind: 'multi_phase',
            values: {
              phases: [
                {
                  phaseName: 'Fase 1',
                  initialPayment: 500000,
                  monthlyControlsCount: 6,
                  pricePerControl: 100000,
                },
              ],
              retainerPrice: 0,
            },
          },
        },
      },
    }),
  )

  assert.equal(error, null)
})
