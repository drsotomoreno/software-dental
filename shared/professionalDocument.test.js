import assert from 'node:assert/strict'
import test from 'node:test'
import {
  dominantProfessionalDocument,
  firstValidProfessionalDocument,
  keepStoredDocumentNumber,
  professionalDocumentCandidatesForSigner,
  validateProfessionalDocumentNumber,
} from './professionalDocument.js'

const CEDULA = '52333444'
const OTRA = '1099887766'

test('la cédula del consentimiento cierra la atención aunque el perfil esté vacío', () => {
  const clinical = {
    informedConsent: { professionalLicense: '52.333.444', professionalRegistry: '' },
    evolutionNotes: [
      {
        professionalLicense: CEDULA,
        authorUserId: 'id-local-viejo',
        authorEmail: 'doctormauriciosoto@gmail.com',
      },
    ],
  }
  const signer = { id: 'id-servidor', email: 'doctormauriciosoto@gmail.com', documentNumber: '' }
  const resolved = firstValidProfessionalDocument(
    [signer.documentNumber, ...professionalDocumentCandidatesForSigner(clinical, signer)],
    'CC',
  )
  assert.equal(resolved, CEDULA)
  assert.equal(validateProfessionalDocumentNumber('').valid, false)
})

test('la cédula del paciente no se usa como cédula del profesional', () => {
  const clinical = {
    informedConsent: { professionalLicense: '', professionalRegistry: '' },
    evolutionNotes: [],
    documentNumber: '80001122',
  }
  const resolved = firstValidProfessionalDocument(
    ['', ...professionalDocumentCandidatesForSigner(clinical, { id: 'u1', email: 'a@b.co' })],
    'CC',
  )
  assert.equal(resolved, '')
})

test('no adopta la cédula de una evolución de otro profesional', () => {
  const clinical = {
    informedConsent: { professionalLicense: OTRA, professionalRegistry: OTRA },
    evolutionNotes: [
      {
        professionalLicense: OTRA,
        authorEmail: 'otro@clinica.co',
        authorUserId: 'otro',
      },
    ],
  }
  const candidates = professionalDocumentCandidatesForSigner(clinical, {
    id: 'u1',
    email: 'doctormauriciosoto@gmail.com',
  })
  assert.equal(firstValidProfessionalDocument(candidates), '')
})

test('si toda la clínica repite una sola cédula, esa se recupera', () => {
  assert.equal(dominantProfessionalDocument([CEDULA, `CC ${CEDULA}`, '52.333.444']), CEDULA)
  assert.equal(dominantProfessionalDocument([CEDULA, OTRA]), '')
})

test('guardar el perfil IPS sin cédula no borra la que ya estaba', () => {
  assert.equal(keepStoredDocumentNumber(CEDULA, ''), CEDULA)
  assert.equal(keepStoredDocumentNumber(CEDULA, '1099887766'), '1099887766')
  assert.equal(keepStoredDocumentNumber('', ''), '')
})
