import assert from 'node:assert/strict'
import test from 'node:test'
import {
  isBlankClinicalShell,
  shouldPersistClinicalDraft,
  shouldReplaceClinicalDocument,
} from './clinicalRecordGuard.js'

const signedAt = '2026-10-23T18:40:00.000Z'

function signedHistory(updatedAt = signedAt) {
  return {
    syncId: 'rec-nicolas',
    updatedAt,
    payload: {
      patientId: '42',
      isLocked: true,
      isSigned: true,
      signedAt,
      contentHash: 'hash-historia-nicolas',
      anamnesis: { chiefComplaint: 'Dolor en molar 16' },
      findings: 'Caries profunda',
      diagnoses: [{ code: 'K02.1', description: 'Caries' }],
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
      informedConsent: { textAccepted: true, signedAt, professionalSignatureDataUrl: 'data:image/png;base64,firma' },
      treatingDentistSignature: {
        signedAt,
        signatureDataUrl: 'data:image/png;base64,tratante',
        professionalName: 'Odontólogo tratante',
      },
    },
  }
}

function blankHistory(updatedAt) {
  return {
    syncId: 'rec-nicolas',
    updatedAt,
    payload: {
      patientId: '42',
      isLocked: false,
      isSigned: false,
      signedAt: '',
      contentHash: '',
      anamnesis: { chiefComplaint: '', currentIllness: '' },
      findings: '',
      diagnoses: [],
      evolutionNotes: [],
      informedConsent: { textAccepted: false, professionalLicense: '1097106893' },
      treatingDentistSignature: null,
    },
  }
}

test('una copia en blanco más nueva no reemplaza la historia firmada', () => {
  const signed = signedHistory('2026-10-23T18:40:00.000Z')
  const blank = blankHistory('2026-10-24T13:05:00.000Z')
  assert.equal(shouldReplaceClinicalDocument(signed, blank), false)
})

test('la historia firmada recupera el lugar de una copia en blanco más nueva', () => {
  const signed = signedHistory('2026-10-23T18:40:00.000Z')
  const blank = blankHistory('2026-10-24T13:05:00.000Z')
  assert.equal(shouldReplaceClinicalDocument(blank, signed), true)
})

test('la firma del tratante sin cierre RIPS también queda protegida', () => {
  const signed = {
    updatedAt: '2026-10-23T18:40:00.000Z',
    isLocked: false,
    isSigned: true,
    signedAt,
    contentHash: 'hash-tratante',
    anamnesis: { chiefComplaint: 'Control' },
    treatingDentistSignature: {
      signedAt,
      signatureDataUrl: 'data:image/png;base64,tratante',
    },
  }
  const blank = blankHistory('2026-10-24T13:05:00.000Z').payload
  assert.equal(shouldReplaceClinicalDocument(signed, { ...blank, updatedAt: '2026-10-24T13:05:00.000Z' }), false)
})

test('un borrador con anamnesis no se pierde contra un formulario vacío más nuevo', () => {
  const draft = {
    updatedAt: '2026-10-23T19:00:00.000Z',
    clinicalDraft: {
      anamnesis: { chiefComplaint: 'Dolor' },
      evolutionNotes: [{ id: 'evo-1', procedure: 'Resina', clinicalNote: 'Hecho', isLocked: true, signedAt, contentHash: 'h' }],
    },
  }
  const empty = {
    updatedAt: '2026-10-24T08:00:00.000Z',
    clinicalDraft: {
      anamnesis: { chiefComplaint: '' },
      diagnoses: [],
      evolutionNotes: [],
      informedConsent: { professionalLicense: '1097106893' },
    },
  }
  assert.equal(isBlankClinicalShell(empty), true)
  assert.equal(shouldReplaceClinicalDocument(draft, empty), false)
  assert.equal(shouldReplaceClinicalDocument(empty, draft), true)
  assert.equal(shouldPersistClinicalDraft(draft.clinicalDraft, empty.clinicalDraft), false)
})

test('dos historias con contenido siguen la fecha: la más nueva gana', () => {
  const older = signedHistory('2026-10-23T18:40:00.000Z')
  const newer = signedHistory('2026-10-23T19:40:00.000Z')
  newer.payload = {
    ...newer.payload,
    contentHash: older.payload.contentHash,
    findings: 'Caries profunda y fistula',
  }
  assert.equal(shouldReplaceClinicalDocument(older, newer), true)
  assert.equal(shouldReplaceClinicalDocument(newer, older), false)
})

test('firmar un formulario vacío no borra la historia que ya tenía contenido', () => {
  const full = {
    updatedAt: '2026-10-23T18:00:00.000Z',
    isSigned: false,
    isLocked: false,
    anamnesis: { chiefComplaint: 'Dolor' },
    evolutionNotes: [{ id: 'evo-1', procedure: 'Resina', clinicalNote: 'Hecho' }],
  }
  const emptySigned = {
    updatedAt: '2026-10-24T15:00:00.000Z',
    isSigned: true,
    isLocked: false,
    signedAt,
    contentHash: 'hash-vacio',
    anamnesis: { chiefComplaint: '' },
    evolutionNotes: [],
    treatingDentistSignature: {
      signedAt,
      signatureDataUrl: 'data:image/png;base64,tratante',
    },
  }
  assert.equal(shouldReplaceClinicalDocument(full, emptySigned), false)
})

test('otro hash firmado no reescribe el documento legal ya guardado', () => {
  const original = signedHistory('2026-10-23T18:40:00.000Z')
  const rewritten = signedHistory('2026-10-24T13:05:00.000Z')
  rewritten.payload = {
    ...rewritten.payload,
    contentHash: 'otro-hash',
    anamnesis: { chiefComplaint: 'Texto distinto' },
  }
  assert.equal(shouldReplaceClinicalDocument(original, rewritten), false)
})

test('la plantilla periodontal vacía no cuenta como historia clínica', () => {
  const shell = {
    specializedAnnexes: {
      periodontics: {
        teeth: [
          {
            number: 16,
            clinicalStatus: 'presente',
            mobility: 0,
            furcation: '0',
            sites: { mb: { pbs: null, mg: null, bop: false, plaque: false } },
          },
        ],
        treatmentPlan: [
          { procedure: 'Instrucción de higiene oral, control de placa, RAR', status: 'pendiente' },
          { procedure: 'Cirugía periodontal / regenerativa', status: 'pendiente' },
          { procedure: 'Soporte periodontal (mantenimiento)', status: 'pendiente' },
        ],
      },
    },
    informedConsent: { professionalLicense: '1097106893' },
  }
  assert.equal(isBlankClinicalShell(shell), true)
})

test('un formulario más nuevo no borra la evolución que ya estaba guardada', () => {
  const withVisit = {
    updatedAt: '2026-10-23T22:40:27.226Z',
    valuationConsent: { consentimientoValoracionAceptado: true },
    evolutionNotes: [
      {
        id: 'rips-visit',
        procedure: 'Ortodoncia correctiva con aparatos fijos',
        clinicalNote: 'Atención del 23 de octubre',
        cupsCode: '391402',
      },
    ],
    diagnoses: [{ code: 'K07.4', description: 'Maloclusión, no especificada', type: 'principal' }],
  }
  const newerShell = {
    updatedAt: '2026-10-24T15:17:02.651Z',
    valuationConsent: { consentimientoValoracionAceptado: true },
    evolutionNotes: [],
    diagnoses: [],
    anamnesis: { chiefComplaint: '' },
  }
  assert.equal(shouldReplaceClinicalDocument(withVisit, newerShell), false)
  assert.equal(shouldReplaceClinicalDocument(newerShell, withVisit), true)
})
