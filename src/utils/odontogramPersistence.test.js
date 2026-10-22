import assert from 'node:assert/strict'
import test from 'node:test'
import {
  mergeLivingChart,
  odontogramAfterPersist,
  pickOdontogram,
} from './odontogramPersistence.ts'

function chart(updatedAt, marked) {
  return {
    updatedAt,
    patientId: '1',
    dentitionType: 'permanente',
    isInitialState: !marked,
    teeth: [
      {
        number: 16,
        globalState: 'presente',
        faces: {
          vestibular: 'sano',
          mesial: 'sano',
          oclusal: marked ? 'caries' : 'sano',
          distal: 'sano',
          lingual: 'sano',
        },
      },
    ],
  }
}

test('un odontograma vacío más nuevo no borra las marcas', () => {
  const marked = chart('2026-10-22T15:00:00.000Z', true)
  const blank = chart('2026-10-22T16:00:00.000Z', false)
  assert.equal(pickOdontogram(marked, blank), marked)
})

test('las marcas más nuevas reemplazan el odontograma anterior', () => {
  const older = chart('2026-10-22T15:00:00.000Z', false)
  const newer = chart('2026-10-22T16:00:00.000Z', true)
  assert.equal(pickOdontogram(older, newer), newer)
})

test('a igual fecha se conservan las marcas', () => {
  const stamp = '2026-10-22T15:00:00.000Z'
  const blank = chart(stamp, false)
  const marked = chart(stamp, true)
  assert.equal(pickOdontogram(blank, marked), marked)
  assert.equal(pickOdontogram(marked, blank), marked)
})

test('el borrador más nuevo conserva los diagnósticos de la sección 4', () => {
  const signed = {
    diagnoses: [],
    diagnosticChart: { entries: [], notes: '' },
    findings: '',
    budgetItems: [{ id: 'viejo' }],
  }
  const draft = {
    diagnoses: [{ code: 'K02.1', description: 'Caries', type: 'principal' }],
    diagnosticChart: {
      entries: [{ dienteId: '16', diagnosisCode: 'K02.1', diagnosisDescription: 'Caries', color: '#3B82F6' }],
      notes: 'molar',
    },
    findings: 'Caries en 16',
    budgetItems: [{ id: 'nuevo' }],
  }

  const merged = mergeLivingChart(signed, draft, true)
  assert.equal(merged.diagnoses.length, 1)
  assert.equal(merged.diagnosticChart.entries[0].dienteId, '16')
  assert.equal(merged.findings, 'Caries en 16')
  assert.equal(merged.budgetItems[0].id, 'nuevo')
})

test('un borrador nuevo y vacío no borra los diagnósticos ya firmados', () => {
  const signed = {
    diagnoses: [{ code: 'K02.1', description: 'Caries', type: 'principal' }],
    diagnosticChart: {
      entries: [{ dienteId: '16', diagnosisCode: 'K02.1', diagnosisDescription: 'Caries', color: '#3B82F6' }],
      notes: 'molar',
    },
    findings: 'Caries en 16',
    budgetItems: [{ id: 'firmado' }],
  }
  const draft = {
    diagnoses: [],
    diagnosticChart: { entries: [], notes: '' },
    findings: '',
    budgetItems: [{ id: 'vacio' }],
  }

  const merged = mergeLivingChart(signed, draft, true)
  assert.equal(merged.diagnoses[0].code, 'K02.1')
  assert.equal(merged.diagnosticChart.entries[0].dienteId, '16')
  assert.equal(merged.findings, 'Caries en 16')
  assert.equal(merged.budgetItems[0].id, 'vacio')
})

test('guardar el id no pisa los dientes que siguen en edición', () => {
  const editing = chart('2026-10-22T16:00:00.000Z', true)
  const persisted = { ...chart('2026-10-22T16:00:01.000Z', false), id: 4 }
  const next = odontogramAfterPersist(editing, persisted)
  assert.equal(next.id, 4)
  assert.equal(next.teeth[0].faces.oclusal, 'caries')
})

test('un cierre más nuevo no se pisa con un borrador viejo que aún tiene datos', () => {
  const signed = {
    diagnoses: [{ code: 'K04.0', description: 'Pulpitis', type: 'principal' }],
    diagnosticChart: {
      entries: [{ dienteId: '21', diagnosisCode: 'K04.0', diagnosisDescription: 'Pulpitis', color: '#EF4444' }],
      notes: '',
    },
    findings: 'Pulpitis',
  }
  const draft = {
    diagnoses: [],
    diagnosticChart: { entries: [], notes: '' },
    findings: '',
  }

  const merged = mergeLivingChart(signed, draft, false)
  assert.equal(merged.diagnoses[0].code, 'K04.0')
  assert.equal(merged.diagnosticChart.entries[0].dienteId, '21')
})
