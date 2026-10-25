import assert from 'node:assert/strict'
import test from 'node:test'
import {
  collectSection4DiagnosisImports,
  importDiagnosesToTreatmentPlan,
  previewDiagnosisTreatmentImports,
} from './treatmentPlanDiagnosisImport.ts'

test('importa piezas del esquema y diagnósticos adicionales de la sección 4', () => {
  const sources = collectSection4DiagnosisImports(
    [
      {
        code: 'K02.1',
        description: 'Caries de la dentina',
        type: 'principal',
        certainty: 'confirmado',
        affectedTeeth: [16, 26],
      },
      {
        code: 'K05.1',
        description: 'Gingivitis crónica',
        type: 'relacionado',
        certainty: 'impresion',
      },
    ],
    [
      {
        dienteId: '16',
        diagnosisCode: 'K02.1',
        diagnosisDescription: 'Caries de la dentina',
        color: '#EF4444',
      },
    ],
  )

  assert.deepEqual(
    sources.map((source) => `${source.code}:${source.toothNumber ?? '-'}:${source.description}`),
    ['K02.1:16:Caries de la dentina', 'K02.1:26:Caries de la dentina', 'K05.1:-:Gingivitis crónica'],
  )
})

test('no repite un diagnóstico que ya está en el plan', () => {
  const plan = [
    {
      id: 'existente',
      phase: 'fase_ii',
      procedure: '',
      diagnosisCode: 'K02.1',
      diagnosisDescription: 'Caries de la dentina',
      anatomicalZone: '16',
      toothNumber: 16,
      quantity: 1,
      unitPrice: 0,
      patientApproved: 'pendiente',
      executionStatus: 'pendiente',
      source: 'diagnostico',
    },
  ]
  const diagnoses = [
    {
      code: 'K02.1',
      description: 'Caries de la dentina',
      type: 'principal',
      certainty: 'confirmado',
      affectedTeeth: [16],
    },
  ]

  assert.equal(previewDiagnosisTreatmentImports(diagnoses, plan).length, 0)
  const next = importDiagnosesToTreatmentPlan(diagnoses, plan)
  assert.equal(next.length, 1)
  assert.equal(next[0].id, 'existente')
  assert.equal(next[0].toothNumber, 16)
})

test('agrega la pieza que todavía no está en el plan', () => {
  const next = importDiagnosesToTreatmentPlan(
    [
      {
        code: 'k02.1',
        description: 'Caries de la dentina',
        type: 'principal',
        certainty: 'confirmado',
        affectedTeeth: [21],
      },
    ],
    [],
  )

  assert.equal(next.length, 1)
  assert.equal(next[0].diagnosisCode, 'K02.1')
  assert.equal(next[0].anatomicalZone, '21')
  assert.equal(next[0].toothNumber, 21)
  assert.equal(next[0].procedure, '')
  assert.equal(next[0].source, 'diagnostico')
})

test('importa un diagnóstico adicional de maxilar o de toda la dentición', () => {
  const next = importDiagnosesToTreatmentPlan(
    [
      {
        code: 'K05.1',
        description: 'Gingivitis crónica',
        type: 'relacionado',
        certainty: 'impresion',
        anatomicalScope: 'maxilar_superior',
      },
      {
        code: 'K07.4',
        description: 'Maloclusión, no especificada',
        type: 'relacionado',
        certainty: 'confirmado',
        anatomicalScope: 'denticion',
      },
    ],
    [],
  )

  assert.equal(next.length, 2)
  assert.equal(next[0].anatomicalZone, 'Arcada Superior')
  assert.equal(next[0].arch, 'superior')
  assert.equal(next[0].toothNumber, undefined)
  assert.equal(next[1].anatomicalZone, 'General')
  assert.equal(next[1].arch, undefined)
  assert.equal(next[1].toothNumber, undefined)

  const again = importDiagnosesToTreatmentPlan(
    [
      {
        code: 'K05.1',
        description: 'Gingivitis crónica',
        type: 'relacionado',
        certainty: 'impresion',
        anatomicalScope: 'maxilar_superior',
      },
    ],
    next,
  )
  assert.equal(again.length, 2)
})
