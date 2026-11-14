import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  isHeavySyncJson,
  MAX_SYNC_DRAFT_JSON_CHARS,
  omitHeavyClinicalDraftForms,
} from './clinicalSyncHeavyPayload.js'

test('isHeavySyncJson detecta clinicalDraft > 50 KB', () => {
  const light = { anamnesis: { chiefComplaint: 'Dolor' } }
  assert.equal(isHeavySyncJson(light), false)

  const heavy = { blob: 'x'.repeat(MAX_SYNC_DRAFT_JSON_CHARS + 100) }
  assert.equal(isHeavySyncJson(heavy), true)
})

test('omitHeavyClinicalDraftForms nullifica solo formularios pesados en drafts', () => {
  const payload = {
    patientId: '42',
    clinicalDraft: { blob: 'y'.repeat(MAX_SYNC_DRAFT_JSON_CHARS + 50) },
    valuationDraft: { anamnesis: { chiefComplaint: 'Ok' } },
    odontogramDraft: { teeth: [] },
  }
  const next = omitHeavyClinicalDraftForms(payload)
  assert.equal(next.clinicalDraft, null)
  assert.equal(next.valuationDraft.anamnesis.chiefComplaint, 'Ok')
  assert.deepEqual(next.odontogramDraft, { teeth: [] })
  assert.equal(next.patientId, '42')
})

test('omitHeavyClinicalDraftForms limpia store.clinics.*.drafts', () => {
  const store = {
    clinics: {
      'clinic:1': {
        drafts: {
          'draft:1': {
            syncId: 'draft:1',
            payload: {
              clinicalDraft: { data: 'z'.repeat(MAX_SYNC_DRAFT_JSON_CHARS + 10) },
            },
          },
        },
      },
    },
  }
  const next = omitHeavyClinicalDraftForms(store)
  assert.equal(next.clinics['clinic:1'].drafts['draft:1'].payload.clinicalDraft, null)
})
