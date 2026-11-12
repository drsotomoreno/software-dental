import assert from 'node:assert/strict'
import test from 'node:test'
import {
  hashClinicalRecord,
  hashEvolutionNote,
  rejectsSignedClinicalMutation,
  sealsMatch,
  verifyIncomingClinicalSeal,
} from './clinicalHash.js'

const signedAt = '2026-10-23T18:40:00.000Z'

function signedRecord(overrides = {}) {
  return {
    syncId: 'rec-1',
    updatedAt: signedAt,
    payload: {
      patientId: '42',
      isLocked: true,
      isSigned: true,
      signedAt,
      contentHash: 'cliente-puede-mentir',
      anamnesis: { chiefComplaint: 'Dolor en molar 16' },
      findings: 'Caries profunda',
      diagnoses: [{ code: 'K02.1', description: 'Caries' }],
      evolutionNotes: [
        {
          id: 'evo-1',
          procedure: 'Resina',
          clinicalNote: 'Se realizó obturación.',
          cupsCode: '890201',
          isLocked: true,
          signedAt,
          contentHash: 'hash-cliente',
          professionalSignatureDataUrl: 'data:image/png;base64,firma',
          workflowStatus: 'CLOSED',
          ripsMetadata: { tipoVinculacionFinanciera: 'recibo_interno' },
        },
      ],
      treatingDentistSignature: {
        signedAt,
        signatureDataUrl: 'data:image/png;base64,tratante',
        professionalName: 'Dr. Soto',
      },
      ...overrides,
    },
  }
}

test('hash clínico es determinístico e ignora updatedAt / workflow / rips', () => {
  const a = signedRecord()
  const b = signedRecord()
  b.updatedAt = '2099-01-01T00:00:00.000Z'
  b.payload.evolutionNotes[0].workflowStatus = 'DRAFT'
  b.payload.evolutionNotes[0].ripsMetadata = { cuv: 'X' }
  b.payload.contentHash = 'otro-mentiroso'
  assert.equal(hashClinicalRecord(a), hashClinicalRecord(b))
})

test('alterar clinicalNote cambia el SHA-256 aunque el contentHash del cliente sea igual', () => {
  const stored = signedRecord()
  const incoming = signedRecord()
  incoming.updatedAt = '2099-01-01T00:00:00.000Z'
  incoming.payload.contentHash = stored.payload.contentHash
  incoming.payload.evolutionNotes[0].clinicalNote = 'Texto adulterado'
  assert.notEqual(hashClinicalRecord(stored), hashClinicalRecord(incoming))
  assert.equal(rejectsSignedClinicalMutation(stored, incoming), true)
})

test('sidecar RIPS no rompe el sello ni provoca hard reject', () => {
  const stored = signedRecord()
  const incoming = signedRecord()
  incoming.payload.evolutionNotes[0].ripsMetadata = {
    tipoVinculacionFinanciera: 'fev',
    cuv: 'CUV-123',
  }
  incoming.payload.evolutionNotes[0].estadoRips = 'RADICADO'
  const check = verifyIncomingClinicalSeal(stored, incoming)
  assert.equal(check.sealed, true)
  assert.equal(check.equal, true)
  assert.equal(rejectsSignedClinicalMutation(stored, incoming), false)
  assert.equal(sealsMatch(check.storedHash, check.incomingHash), true)
})

test('hash de evolución incluye CUPS y firma profesional', () => {
  const note = signedRecord().payload.evolutionNotes[0]
  const alteredCups = { ...note, cupsCode: '999999' }
  const alteredFirma = { ...note, professionalSignatureDataUrl: 'data:image/png;base64,otra' }
  assert.notEqual(hashEvolutionNote(note), hashEvolutionNote(alteredCups))
  assert.notEqual(hashEvolutionNote(note), hashEvolutionNote(alteredFirma))
})
