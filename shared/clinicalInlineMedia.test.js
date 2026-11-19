import assert from 'node:assert/strict'
import test from 'node:test'
import {
  EMBEDDED_BINARY_CHARS,
  LISTING_HEAVY_STRING_CHARS,
  extractClinicalDraftMedia,
  stripListingHeavyStrings,
} from './clinicalInlineMedia.js'

test('stripListingHeavyStrings vacía dataURL > 30 KB y no anula valuationDraft', () => {
  const photo = `data:image/jpeg;base64,${'A'.repeat(LISTING_HEAVY_STRING_CHARS + 20)}`
  const payload = {
    valuationDraft: { anamnesis: { chiefComplaint: 'Dolor' }, photo },
    clinicalDraft: { note: 'texto', photo },
    signatureDataUrl: photo,
  }
  const next = stripListingHeavyStrings(payload)
  assert.equal(next.valuationDraft.anamnesis.chiefComplaint, 'Dolor')
  assert.equal(next.valuationDraft.photo, '')
  assert.equal(next.clinicalDraft.note, 'texto')
  assert.equal(next.clinicalDraft.photo, '')
  assert.equal(next.signatureDataUrl, photo)
  assert.notEqual(next.valuationDraft, null)
  assert.notEqual(next.clinicalDraft, null)
})

test('extractClinicalDraftMedia saca base64 > 50 KB solo de clinicalDraft', () => {
  const photo = `data:image/png;base64,${'B'.repeat(EMBEDDED_BINARY_CHARS + 80)}`
  const blobs = []
  const next = extractClinicalDraftMedia(
    {
      clinicalDraft: { anexos: { foto: photo }, motivo: 'Caries' },
      valuationDraft: { foto: photo, anamnesis: { chiefComplaint: 'Valoración' } },
    },
    blobs,
  )
  assert.equal(blobs.length, 1)
  assert.equal(next.clinicalDraft.motivo, 'Caries')
  assert.equal(next.clinicalDraft.anexos.foto.storage, 'clinical-media')
  assert.equal(typeof next.clinicalDraft.anexos.foto.mediaRef, 'string')
  assert.equal(next.valuationDraft.foto, photo)
  assert.equal(next.valuationDraft.anamnesis.chiefComplaint, 'Valoración')
})
