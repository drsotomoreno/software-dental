import assert from 'node:assert/strict'
import test from 'node:test'
import {
  computeClinicalFormHash,
  detectChangedClinicalSections,
} from './clinicalFormHash.js'
import {
  clinicalRevisionOf,
  localDraftBlocksRemoteOverwrite,
  nextClinicalRevision,
} from './clinicalRevision.js'
import { shouldReplaceClinicalDocument } from './clinicalRecordGuard.js'

test('computeClinicalFormHash es estable ante el orden de claves', () => {
  const a = computeClinicalFormHash({
    anamnesis: { chiefComplaint: 'dolor', b: 1, a: 2 },
    diagnoses: [{ code: 'K02.1' }],
  })
  const b = computeClinicalFormHash({
    diagnoses: [{ code: 'K02.1' }],
    anamnesis: { a: 2, b: 1, chiefComplaint: 'dolor' },
  })
  assert.equal(a, b)
})

test('detectChangedClinicalSections marca anamnesis', () => {
  const changed = detectChangedClinicalSections(
    { anamnesis: { chiefComplaint: 'antes' } },
    { anamnesis: { chiefComplaint: 'después' } },
  )
  assert.ok(changed.includes('anamnesis'))
})

test('clinicalRevision decide shouldReplace aunque dropsClinicalSections', () => {
  const prev = {
    clinicalRevision: 1,
    clinicalDraft: {
      anamnesis: { chiefComplaint: 'dolor' },
      budgetItems: [{ id: 'b1', procedure: 'Resina' }],
      paymentControl: [{ id: 'p1', amount: 10000, paymentDate: '2026-11-01' }],
    },
  }
  const next = {
    clinicalRevision: 2,
    clinicalDraft: {
      anamnesis: { chiefComplaint: 'dolor corregido' },
      budgetItems: [],
      paymentControl: [{ id: 'p1', amount: 10000, paymentDate: '2026-11-01' }],
    },
  }
  assert.equal(shouldReplaceClinicalDocument(prev, next), true)
  assert.equal(nextClinicalRevision(prev), 2)
  assert.equal(clinicalRevisionOf(next), 2)
})

test('localDraftBlocksRemoteOverwrite protege pending', () => {
  assert.equal(
    localDraftBlocksRemoteOverwrite(
      { syncStatus: 'pending', clinicalRevision: 3 },
      { clinicalRevision: 3, updatedAt: '2099-01-01T00:00:00.000Z' },
    ),
    true,
  )
  assert.equal(
    localDraftBlocksRemoteOverwrite(
      { syncStatus: 'synced', clinicalRevision: 5 },
      { clinicalRevision: 4 },
    ),
    true,
  )
  assert.equal(
    localDraftBlocksRemoteOverwrite(
      { syncStatus: 'synced', clinicalRevision: 2 },
      { clinicalRevision: 4 },
    ),
    false,
  )
})
