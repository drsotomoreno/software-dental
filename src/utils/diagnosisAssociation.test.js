import assert from 'node:assert/strict'
import test from 'node:test'
import {
  detectDiagnosisAnatomicalScope,
  diagnosisHasAnatomicalAssociation,
  diagnosisLocationLabel,
  parseDiagnosisAssociation,
  stripDiagnosisScopePhrases,
} from './diagnosisAssociation.ts'
import { validateClinicalRecordDraft } from './validateClinicalRecordDraft.ts'

test('interpreta diente, maxilar y toda la dentición', () => {
  assert.deepEqual(parseDiagnosisAssociation('tooth:16'), { kind: 'tooth', toothNumber: 16 })
  assert.deepEqual(parseDiagnosisAssociation('maxilar_superior'), {
    kind: 'scope',
    scope: 'maxilar_superior',
  })
  assert.deepEqual(parseDiagnosisAssociation('maxilar_inferior'), {
    kind: 'scope',
    scope: 'maxilar_inferior',
  })
  assert.deepEqual(parseDiagnosisAssociation('denticion'), { kind: 'scope', scope: 'denticion' })
  assert.equal(parseDiagnosisAssociation('tooth:99'), null)
  assert.deepEqual(parseDiagnosisAssociation('tooth:55'), { kind: 'tooth', toothNumber: 55 })
  assert.equal(parseDiagnosisAssociation(''), null)
})

test('describe la asociación guardada', () => {
  assert.equal(
    diagnosisLocationLabel({ affectedTeeth: [21], anatomicalScope: 'denticion' }),
    'Pieza 21',
  )
  assert.equal(diagnosisLocationLabel({ affectedTeeth: [16, 26] }), 'Piezas 16, 26')
  assert.equal(diagnosisLocationLabel({ anatomicalScope: 'maxilar_inferior' }), 'Maxilar inferior')
  assert.equal(diagnosisLocationLabel({ anatomicalScope: 'denticion' }), 'Toda la dentición')
  assert.equal(diagnosisLocationLabel({ toothNumber: 55 }), 'Pieza 55')
  assert.equal(diagnosisLocationLabel({}), null)
})

test('reconoce el alcance en el dictado', () => {
  assert.equal(
    detectDiagnosisAnatomicalScope('diagnostico gingivitis en maxilar superior'),
    'maxilar_superior',
  )
  assert.equal(detectDiagnosisAnatomicalScope('K05.1 arcada inferior'), 'maxilar_inferior')
  assert.equal(
    detectDiagnosisAnatomicalScope('diagnóstico adicional en toda la dentición'),
    'denticion',
  )
  assert.equal(detectDiagnosisAnatomicalScope('diagnostico caries pieza 16'), null)
  assert.equal(
    stripDiagnosisScopePhrases('gingivitis en maxilar superior'),
    'gingivitis en',
  )
})

test('exige asociación al cerrar la atención si el diagnóstico adicional no tiene ubicación', () => {
  const base = {
    anamnesis: { chiefComplaint: 'Dolor' },
    diagnosticChart: { entries: [], notes: '' },
    treatmentPlan: [{ procedure: 'Control' }],
    budgetItems: [{ procedure: 'Control' }],
  }
  const loose = validateClinicalRecordDraft({
    ...base,
    diagnoses: [
      {
        code: 'S02.5',
        description: 'Fractura de diente',
        type: 'relacionado',
        certainty: 'impresion',
      },
    ],
  })
  assert.equal(
    loose.some((issue) => issue.includes('S02.5') && issue.includes('maxilar')),
    true,
  )
  assert.equal(
    loose.some((issue) => issue.includes('esquema')),
    false,
  )

  const scoped = validateClinicalRecordDraft({
    ...base,
    diagnoses: [
      {
        code: 'K05.1',
        description: 'Gingivitis crónica',
        type: 'principal',
        certainty: 'impresion',
        anatomicalScope: 'maxilar_superior',
      },
    ],
  })
  assert.equal(
    scoped.some((issue) => issue.includes('diagnóstico') || issue.includes('Diagnóstico')),
    false,
  )

  const painted = validateClinicalRecordDraft({
    ...base,
    diagnoses: [
      {
        code: 'S02.5',
        description: 'Fractura de diente',
        type: 'relacionado',
        certainty: 'impresion',
      },
    ],
    diagnosticChart: {
      entries: [
        {
          dienteId: '11',
          diagnosisCode: 'S02.5',
          diagnosisDescription: 'Fractura de diente',
          color: '#3B82F6',
        },
      ],
      notes: '',
    },
  })
  assert.equal(
    diagnosisHasAnatomicalAssociation(
      { code: 'S02.5' },
      [{ diagnosisCode: 'S02.5', dienteId: '11' }],
    ),
    true,
  )
  assert.equal(
    painted.some((issue) => issue.includes('S02.5')),
    false,
  )
})
