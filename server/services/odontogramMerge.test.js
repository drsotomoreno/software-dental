import assert from 'node:assert/strict'
import test from 'node:test'
import { draftRecordHasDiagnoses, odontogramRecordHasMarks } from './odontogramMerge.js'

test('un odontograma con caries cuenta como marcado', () => {
  assert.equal(
    odontogramRecordHasMarks({
      payload: {
        teeth: [{ globalState: 'presente', faces: { oclusal: 'caries' } }],
      },
    }),
    true,
  )
  assert.equal(
    odontogramRecordHasMarks({
      teeth: [{ globalState: 'presente', faces: { oclusal: 'sano' } }],
    }),
    false,
  )
})

test('el borrador de la sección 4 se reconoce por diagnósticos o por el esquema', () => {
  assert.equal(
    draftRecordHasDiagnoses({
      payload: { clinicalDraft: { diagnoses: [{ code: 'K02.1' }] } },
    }),
    true,
  )
  assert.equal(
    draftRecordHasDiagnoses({
      payload: { clinicalDraft: { diagnoses: [], diagnosticChart: { entries: [] } } },
    }),
    false,
  )
})
