import assert from 'node:assert/strict'
import test from 'node:test'
import {
  isSignedInformedConsent,
  keepStoredConsentSignatures,
  restoreMissingConsentSignatures,
  signedConsentTemplateIds,
} from './consent.ts'

const stored = {
  selectedConsentIds: ['ortodoncia_brackets'],
  textAccepted: true,
  signedAt: '2026-10-23T18:40:00.000Z',
  patientSignatureDataUrl: 'data:image/png;base64,paciente',
  patientSignatureMeta: { strokeCount: 6 },
  professionalSignatureDataUrl: 'data:image/png;base64,profesional',
  professionalSignatureMeta: { strokeCount: 7 },
  professionalLicense: '79984620',
  professionalRegistry: '79984620',
}

test('un consentimiento sin imágenes conserva las firmas guardadas', () => {
  const next = keepStoredConsentSignatures(stored, {
    selectedConsentIds: ['ortodoncia_brackets'],
    textAccepted: true,
    professionalLicense: '79984620',
    professionalRegistry: '79984620',
  })
  assert.equal(next.patientSignatureDataUrl, stored.patientSignatureDataUrl)
  assert.equal(next.professionalSignatureDataUrl, stored.professionalSignatureDataUrl)
  assert.equal(next.patientSignatureMeta, stored.patientSignatureMeta)
  assert.equal(next.signedAt, stored.signedAt)
  assert.equal(next.textAccepted, true)
})

test('la firma nueva no se pisa con la anterior', () => {
  const next = keepStoredConsentSignatures(stored, {
    ...stored,
    professionalSignatureDataUrl: 'data:image/png;base64,nueva',
    signedAt: '2026-10-24T12:00:00.000Z',
  })
  assert.equal(next.professionalSignatureDataUrl, 'data:image/png;base64,nueva')
  assert.equal(next.patientSignatureDataUrl, stored.patientSignatureDataUrl)
  assert.equal(next.signedAt, '2026-10-24T12:00:00.000Z')
})

test('ortodoncia recupera las firmas del consentimiento guardado', () => {
  const current = {
    selectedConsentIds: ['ortodoncia_brackets'],
    textAccepted: true,
    professionalLicense: '79984620',
    professionalRegistry: '79984620',
  }
  const restored = restoreMissingConsentSignatures(current, stored)
  assert.equal(restored.patientSignatureDataUrl, stored.patientSignatureDataUrl)
  assert.equal(restored.professionalSignatureDataUrl, stored.professionalSignatureDataUrl)
})

test('no mezcla firmas de otro procedimiento', () => {
  const current = {
    selectedConsentIds: ['implantes_dentales'],
    textAccepted: true,
    professionalLicense: '79984620',
    professionalRegistry: '79984620',
  }
  const restored = restoreMissingConsentSignatures(current, stored)
  assert.equal(restored.patientSignatureDataUrl, undefined)
  assert.equal(restored.professionalSignatureDataUrl, undefined)
})

test('un formulario vacío recupera ortodoncia firmada del guardado', () => {
  const current = {
    selectedConsentIds: [],
    textAccepted: false,
    professionalLicense: '',
    professionalRegistry: '',
  }
  const restored = restoreMissingConsentSignatures(current, stored)
  assert.equal(restored.patientSignatureDataUrl, stored.patientSignatureDataUrl)
  assert.equal(restored.professionalSignatureDataUrl, stored.professionalSignatureDataUrl)
  assert.deepEqual(restored.selectedConsentIds, ['ortodoncia_brackets'])
  assert.equal(restored.textAccepted, true)
  assert.equal(restored.signedAt, stored.signedAt)
})

test('ortodoncia firmada sin textAccepted sigue contando como firmada', () => {
  const consent = {
    selectedConsentIds: ['ortodoncia_brackets'],
    textAccepted: false,
    patientSignatureDataUrl: 'data:image/png;base64,paciente',
    professionalSignatureDataUrl: 'data:image/png;base64,profesional',
    professionalLicense: '79984620',
    professionalRegistry: '79984620',
  }
  assert.equal(isSignedInformedConsent(consent), true)
  assert.deepEqual(signedConsentTemplateIds([consent]), ['ortodoncia_brackets'])
})

test('firma solo en ledger (sin data URL en el cuerpo) se reconoce al fusionar', () => {
  const body = {
    selectedConsentIds: ['ortodoncia_brackets'],
    textAccepted: false,
    professionalLicense: '79984620',
    professionalRegistry: '79984620',
  }
  const ledger = {
    selectedConsentIds: ['ortodoncia_brackets'],
    textAccepted: true,
    signedAt: '2026-10-23T18:40:00.000Z',
    patientSignatureDataUrl: 'data:image/png;base64,paciente',
    professionalSignatureDataUrl: 'data:image/png;base64,profesional',
  }
  const merged = keepStoredConsentSignatures(ledger, body)
  assert.equal(isSignedInformedConsent(merged), true)
  assert.deepEqual(signedConsentTemplateIds([body]), [])
  assert.deepEqual(signedConsentTemplateIds([merged]), ['ortodoncia_brackets'])
})

test('un borrador sin aceptar conserva textAccepted del consentimiento firmado', () => {
  const next = keepStoredConsentSignatures(stored, {
    selectedConsentIds: ['ortodoncia_brackets'],
    textAccepted: false,
    professionalLicense: '79984620',
    professionalRegistry: '79984620',
  })
  assert.equal(next.textAccepted, true)
  assert.equal(next.patientSignatureDataUrl, stored.patientSignatureDataUrl)
})
