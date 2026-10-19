import assert from 'node:assert/strict'
import test from 'node:test'
import { createEmptySpecializedAnnexes } from '../types/specializedAnnexes.ts'
import { DEFAULT_PHASE_PROCEDURES } from '../types/periodonticsAnnex.ts'
import {
  importAnnexesToTreatmentPlan,
  previewAnnexTreatmentImports,
} from './treatmentPlanAnnexImport.ts'

function emptyAnnexes() {
  return createEmptySpecializedAnnexes()
}

test('un anexo vacío no propone filas', () => {
  assert.equal(previewAnnexTreatmentImports(emptyAnnexes(), []).length, 0)
  const plan = []
  assert.equal(importAnnexesToTreatmentPlan(emptyAnnexes(), plan), plan)
})

test('importa la pieza de endodoncia aunque el presupuesto no esté activo ni tenga precio', () => {
  const annexes = emptyAnnexes()
  annexes.endodontics.toothNumber = 36
  annexes.endodontics.diagnosis = [{ code: 'K04.1', description: 'Necrosis de la pulpa' }]
  annexes.endodontics.budget = {
    active: false,
    toothLines: [{ toothNumber: 36, unitPrice: 0 }],
    notes: '',
  }

  const preview = previewAnnexTreatmentImports(annexes, [])
  assert.equal(preview.length, 1)
  assert.equal(preview[0].procedure, 'Endodoncia — Pieza 36')
  assert.equal(preview[0].toothNumber, 36)
  assert.equal(preview[0].diagnosisCode, 'K04.1')
  assert.equal(preview[0].source, 'endodontics_annex')

  const once = importAnnexesToTreatmentPlan(annexes, [])
  const twice = importAnnexesToTreatmentPlan(annexes, once)
  assert.equal(twice.length, 1)
  assert.equal(twice[0].id, once[0].id)
})

test('importa ortodoncia, cirugía y el plan visual de rehabilitación', () => {
  const annexes = emptyAnnexes()
  annexes.orthodontics.treatmentType = 'alineadores'
  annexes.oralSurgery.treatmentPlan = [
    {
      id: 'cx-1',
      cupsCode: '230102',
      procedure: 'Exodoncia de diente permanente multirradicular',
      toothNumber: 48,
    },
  ]
  annexes.rehabilitationAesthetics.visualTreatmentPlan = [
    { dienteId: '11', tratamiento: 'corona_individual', color: '#ffffff' },
  ]
  annexes.rehabilitationAesthetics.dentalWhitening = {
    ...annexes.rehabilitationAesthetics.dentalWhitening,
    consultorio: true,
  }

  const procedures = previewAnnexTreatmentImports(annexes, []).map((item) => item.procedure)
  assert.ok(procedures.some((procedure) => procedure.includes('Alineadores')))
  assert.ok(procedures.includes('Exodoncia de diente permanente multirradicular'))
  assert.ok(procedures.includes('Corona individual'))
  assert.ok(procedures.some((procedure) => procedure.includes('Blanqueamiento en Consultorio')))

  const once = importAnnexesToTreatmentPlan(annexes, [])
  const twice = importAnnexesToTreatmentPlan(annexes, once)
  assert.equal(twice.length, once.length)
})

test('no importa la plantilla periodontal vacía y sí el plan cuando hay diagnóstico', () => {
  const untouched = emptyAnnexes()
  assert.equal(previewAnnexTreatmentImports(untouched, []).length, 0)

  const annexes = emptyAnnexes()
  annexes.periodontics.diagnosis.staging = 'II'
  const procedures = previewAnnexTreatmentImports(annexes, []).map((item) => item.procedure)
  assert.deepEqual(procedures, [
    DEFAULT_PHASE_PROCEDURES.fase_i,
    DEFAULT_PHASE_PROCEDURES.fase_ii,
    DEFAULT_PHASE_PROCEDURES.fase_iii,
  ])
})

test('importa un procedimiento periodontal editado sin repetirlo', () => {
  const annexes = emptyAnnexes()
  annexes.periodontics.treatmentPlan[0] = {
    ...annexes.periodontics.treatmentPlan[0],
    procedure: 'Raspaje y alisado radicular por cuadrante',
  }

  const once = importAnnexesToTreatmentPlan(annexes, [])
  assert.equal(once.length, 1)
  assert.equal(once[0].procedure, 'Raspaje y alisado radicular por cuadrante')
  assert.equal(once[0].phase, 'fase_i')
  const twice = importAnnexesToTreatmentPlan(annexes, once)
  assert.equal(twice.length, 1)
})
