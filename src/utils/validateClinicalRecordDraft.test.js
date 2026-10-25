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

test('un procedimiento del anexo de cirugía oral cuenta como presupuesto', () => {
  const issues = validateClinicalRecordDraft(
    readyDraft({
      specializedAnnexes: {
        oralSurgery: {
          treatmentPlan: [
            {
              id: 'cx-1',
              cupsCode: '230102',
              procedure: 'Exodoncia de diente permanente multirradicular',
              toothNumber: 38,
            },
          ],
        },
      },
    }),
  )

  assert.equal(issues.includes(MISSING_BUDGET_ITEM), false)
})

test('el plan vacío de periodoncia no cuenta como presupuesto', () => {
  const issues = validateClinicalRecordDraft(
    readyDraft({
      specializedAnnexes: {
        periodontics: {
          treatmentPlan: [
            {
              phase: 'fase_i',
              procedure: 'Instrucción de higiene oral, control de placa, RAR',
              plannedDate: '',
              status: 'pendiente',
              notes: '',
            },
            {
              phase: 'fase_ii',
              procedure: 'Cirugía periodontal / regenerativa',
              plannedDate: '',
              status: 'pendiente',
              notes: '',
            },
            {
              phase: 'fase_iii',
              procedure: 'Soporte periodontal (mantenimiento)',
              plannedDate: '',
              status: 'pendiente',
              notes: '',
            },
          ],
        },
      },
    }),
  )

  assert.deepEqual(issues, [MISSING_BUDGET_ITEM])
})

test('un tratamiento periodontal elegido cuenta como presupuesto', () => {
  const issues = validateClinicalRecordDraft(
    readyDraft({
      specializedAnnexes: {
        periodontics: {
          treatmentPlan: [
            {
              phase: 'fase_ii',
              procedure: 'Cirugía periodontal / regenerativa',
              plannedDate: '2026-11-02',
              status: 'pendiente',
              notes: '',
            },
          ],
        },
      },
    }),
  )

  assert.equal(issues.includes(MISSING_BUDGET_ITEM), false)
})

test('una restauración del anexo de rehabilitación cuenta como presupuesto', () => {
  const issues = validateClinicalRecordDraft(
    readyDraft({
      specializedAnnexes: {
        rehabilitationAesthetics: {
          visualTreatmentPlan: [{ dienteId: '11', tratamiento: 'corona_individual', color: 'A2' }],
        },
      },
    }),
  )

  assert.equal(issues.includes(MISSING_BUDGET_ITEM), false)
})

test('el blanqueamiento del anexo cuenta como presupuesto', () => {
  const issues = validateClinicalRecordDraft(
    readyDraft({
      specializedAnnexes: {
        rehabilitationAesthetics: {
          dentalWhitening: { casero: false, consultorio: true, diente_oscurecido: false },
        },
      },
    }),
  )

  assert.equal(issues.includes(MISSING_BUDGET_ITEM), false)
})

test('un implante planificado en el anexo cuenta como presupuesto', () => {
  const issues = validateClinicalRecordDraft(
    readyDraft({
      specializedAnnexes: {
        dentalImplants: {
          implantPlacementPlan: {
            implants: [{ id: 'imp-1' }],
          },
        },
      },
    }),
  )

  assert.equal(issues.includes(MISSING_BUDGET_ITEM), false)
})

test('un tratamiento ya importado desde un anexo cuenta como presupuesto', () => {
  const issues = validateClinicalRecordDraft(
    readyDraft({
      treatmentPlan: [
        {
          procedure: 'Exodoncia de diente permanente unirradicular',
          source: 'oral_surgery_annex',
        },
      ],
    }),
  )

  assert.equal(issues.includes(MISSING_BUDGET_ITEM), false)
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
