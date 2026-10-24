import assert from 'node:assert/strict'
import test from 'node:test'
import { mergeClinicalStores } from './clinicalSyncStore.js'

const signedAt = '2026-10-23T18:40:00.000Z'

function clinic(records, drafts = {}) {
  return {
    clinics: {
      'clinic:1': {
        clinicalRecords: records,
        drafts,
      },
    },
  }
}

const signedRecord = {
  syncId: 'rec-nicolas',
  updatedAt: signedAt,
  payload: {
    patientId: '42',
    documentNumber: '1097106893',
    isLocked: true,
    isSigned: true,
    signedAt,
    contentHash: 'hash-historia',
    anamnesis: { chiefComplaint: 'Dolor en molar 16' },
    evolutionNotes: [
      {
        id: 'evo-1',
        procedure: 'Resina',
        clinicalNote: 'Se realizó obturación.',
        isLocked: true,
        signedAt,
        contentHash: 'hash-evo',
      },
    ],
    treatingDentistSignature: {
      signedAt,
      signatureDataUrl: 'data:image/png;base64,tratante',
      professionalName: 'Odontólogo tratante',
    },
  },
}

const blankRecord = {
  syncId: 'rec-nicolas',
  updatedAt: '2026-10-24T15:21:00.000Z',
  payload: {
    patientId: '42',
    isLocked: false,
    isSigned: false,
    anamnesis: { chiefComplaint: '' },
    evolutionNotes: [],
    diagnoses: [],
    findings: '',
    informedConsent: { professionalLicense: '1097106893', textAccepted: false },
  },
}

test('el servidor no deja que una copia en blanco más nueva borre la historia firmada', () => {
  const merged = mergeClinicalStores(
    clinic({ 'rec-nicolas': blankRecord }),
    clinic({ 'rec-nicolas': signedRecord }),
  )
  const stored = merged.clinics['clinic:1'].clinicalRecords['rec-nicolas']
  assert.equal(stored.payload.anamnesis.chiefComplaint, 'Dolor en molar 16')
  assert.equal(stored.payload.isSigned, true)
  assert.equal(stored.payload.evolutionNotes[0].procedure, 'Resina')
})

test('el servidor recupera la historia firmada aunque la copia en blanco sea la más nueva', () => {
  const merged = mergeClinicalStores(
    clinic({ 'rec-nicolas': signedRecord }),
    clinic({ 'rec-nicolas': blankRecord }),
  )
  const stored = merged.clinics['clinic:1'].clinicalRecords['rec-nicolas']
  assert.equal(stored.payload.anamnesis.chiefComplaint, 'Dolor en molar 16')
  assert.equal(stored.payload.treatingDentistSignature.signatureDataUrl, 'data:image/png;base64,tratante')
})

test('un borrador con anamnesis sobrevive a un formulario vacío aunque no tenga diagnósticos', () => {
  const draft = {
    syncId: 'draft:42',
    updatedAt: '2026-10-23T19:00:00.000Z',
    payload: {
      patientId: '42',
      clinicalDraft: {
        anamnesis: { chiefComplaint: 'Dolor' },
        diagnoses: [],
        evolutionNotes: [
          {
            id: 'evo-1',
            procedure: 'Resina',
            clinicalNote: 'Hecho',
            isLocked: true,
            signedAt,
            contentHash: 'h',
          },
        ],
      },
    },
  }
  const empty = {
    syncId: 'draft:42',
    updatedAt: '2026-10-24T08:00:00.000Z',
    payload: {
      patientId: '42',
      clinicalDraft: {
        anamnesis: { chiefComplaint: '' },
        diagnoses: [],
        evolutionNotes: [],
        informedConsent: { professionalLicense: '1097106893' },
      },
    },
  }
  const merged = mergeClinicalStores(
    clinic({}, { 'draft:42': empty }),
    clinic({}, { 'draft:42': draft }),
  )
  const stored = merged.clinics['clinic:1'].drafts['draft:42']
  assert.equal(stored.payload.clinicalDraft.anamnesis.chiefComplaint, 'Dolor')
  assert.equal(stored.payload.clinicalDraft.evolutionNotes[0].clinicalNote, 'Hecho')
})
