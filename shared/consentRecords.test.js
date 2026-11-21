import assert from 'node:assert/strict'
import test from 'node:test'
import { parseClinicalConsentPayload } from './consentRecordSchema.js'
import {
  ConsentMedicolegalError,
  assertConsentMutable,
  createConsentDraft,
  getNormalizedConsents,
  mergeConsentRecords,
  patchConsentDraft,
  revokeConsentRecord,
  signConsentRecord,
} from './consentRecords.js'

const professional = {
  professionalId: 'user-1',
  professionalName: 'Dra. Ana Pérez',
  professionalDocument: '1097106893',
  professionalRethus: 'RETHUS-1097106893',
}

const snapshotText =
  'CONSENTIMIENTO INFORMADO PARA ORTODONCIA\nPaciente: Juan Pérez\nProcedimiento: brackets.'

function draftOrtodoncia(overrides = {}) {
  return createConsentDraft({
    templateId: 'ortodoncia_brackets',
    title: 'Ortodoncia con brackets',
    renderedTextSnapshot: snapshotText,
    ...professional,
    ...overrides,
  })
}

function signedOrtodoncia(overrides = {}) {
  return signConsentRecord({
    record: draftOrtodoncia(),
    textAccepted: true,
    patientSignatureDataUrl: 'data:image/png;base64,paciente',
    professionalSignatureDataUrl: 'data:image/png;base64,profesional',
    ...overrides,
  })
}

test('createConsentDraft congela renderedTextSnapshot y queda en draft', () => {
  const draft = draftOrtodoncia()
  assert.equal(draft.status, 'draft')
  assert.equal(draft.renderedTextSnapshot, snapshotText)
  assert.equal(draft.templateId, 'ortodoncia_brackets')
  assert.equal(draft.professionalRethus, professional.professionalRethus)
  assert.ok(draft.id)
  assert.ok(draft.createdAt)
})

test('createConsentDraft exige snapshot y ReTHUS', () => {
  assert.throws(
    () =>
      createConsentDraft({
        templateId: 'cirugia_oral',
        renderedTextSnapshot: '   ',
        ...professional,
      }),
    ConsentMedicolegalError,
  )
  assert.throws(
    () =>
      createConsentDraft({
        templateId: 'cirugia_oral',
        renderedTextSnapshot: snapshotText,
        ...professional,
        professionalRethus: '',
      }),
    ConsentMedicolegalError,
  )
})

test('signConsentRecord exige doble firma, aceptación y ReTHUS; genera SHA-256', () => {
  const signed = signedOrtodoncia()
  assert.equal(signed.status, 'signed')
  assert.ok(signed.signedAt)
  assert.equal(signed.contentHash?.length, 64)
  assert.equal(signed.renderedTextSnapshot, snapshotText)
  assert.equal(signed.patientSignatureDataUrl, 'data:image/png;base64,paciente')
  assert.equal(signed.professionalSignatureDataUrl, 'data:image/png;base64,profesional')
})

test('signConsentRecord bloquea menor sin acudiente y exige firma de guardian', () => {
  const draft = draftOrtodoncia({ signerRole: 'patient' })
  assert.throws(
    () =>
      signConsentRecord({
        record: draft,
        patientIsMinor: true,
        textAccepted: true,
        patientSignatureDataUrl: 'data:image/png;base64,x',
        professionalSignatureDataUrl: 'data:image/png;base64,y',
      }),
    /acudiente/i,
  )

  const signed = signConsentRecord({
    record: draft,
    patientIsMinor: true,
    signerRole: 'guardian',
    guardianName: 'María López',
    guardianDocument: '52123456',
    textAccepted: true,
    patientSignatureDataUrl: 'data:image/png;base64,acudiente',
    professionalSignatureDataUrl: 'data:image/png;base64,odonto',
  })
  assert.equal(signed.signerRole, 'guardian')
  assert.equal(signed.guardianName, 'María López')
  assert.equal(signed.guardianDocument, '52123456')
})

test('registro signed es inmutable: patch y re-firma se bloquean', () => {
  const signed = signedOrtodoncia()
  assert.throws(() => assertConsentMutable(signed), ConsentMedicolegalError)
  assert.throws(() => patchConsentDraft(signed, { textAccepted: false }), ConsentMedicolegalError)
  assert.throws(
    () =>
      signConsentRecord({
        record: signed,
        textAccepted: true,
        patientSignatureDataUrl: 'data:image/png;base64,otra',
        professionalSignatureDataUrl: 'data:image/png;base64,otra',
      }),
    ConsentMedicolegalError,
  )
  assert.equal(signed.renderedTextSnapshot, snapshotText)
})

test('revokeConsentRecord exige motivo y profesional; conserva firmas y texto', () => {
  const signed = signedOrtodoncia()
  assert.throws(
    () =>
      revokeConsentRecord({
        record: signed,
        revokedReason: '',
        revokedByUserId: 'user-1',
      }),
    /motivo/i,
  )
  assert.throws(
    () =>
      revokeConsentRecord({
        record: signed,
        revokedReason: 'Paciente desiste',
        revokedByUserId: '',
      }),
    /profesional/i,
  )

  const revoked = revokeConsentRecord({
    record: signed,
    revokedReason: 'Paciente desiste del tratamiento antes de iniciarlo',
    revokedByUserId: 'user-1',
    revokedAt: '2026-11-21T15:00:00.000Z',
  })
  assert.equal(revoked.status, 'revoked')
  assert.equal(revoked.revokedReason, 'Paciente desiste del tratamiento antes de iniciarlo')
  assert.equal(revoked.revokedByUserId, 'user-1')
  assert.equal(revoked.renderedTextSnapshot, signed.renderedTextSnapshot)
  assert.equal(revoked.patientSignatureDataUrl, signed.patientSignatureDataUrl)
  assert.equal(revoked.professionalSignatureDataUrl, signed.professionalSignatureDataUrl)
  assert.equal(revoked.contentHash, signed.contentHash)
  assert.equal(revoked.signedAt, signed.signedAt)
})

test('mergeConsentRecords: no destruye firmados entre dispositivos; solo admite revoke legal', () => {
  const deviceA = signedOrtodoncia()
  const deviceBAttemptOverwrite = {
    ...deviceA,
    renderedTextSnapshot: 'TEXTO ALTERADO EN OTRO EQUIPO',
    signedAt: '2099-01-01T00:00:00.000Z',
    contentHash: '0'.repeat(64),
    patientSignatureDataUrl: 'data:image/png;base64,falsificada',
  }

  const merged = mergeConsentRecords([deviceA], [deviceBAttemptOverwrite])
  assert.equal(merged.length, 1)
  assert.equal(merged[0].renderedTextSnapshot, snapshotText)
  assert.equal(merged[0].signedAt, deviceA.signedAt)
  assert.equal(merged[0].contentHash, deviceA.contentHash)
  assert.equal(merged[0].patientSignatureDataUrl, deviceA.patientSignatureDataUrl)

  const kept = mergeConsentRecords([deviceA], [])
  assert.equal(kept.length, 1)
  assert.equal(kept[0].id, deviceA.id)

  const revokedIncoming = revokeConsentRecord({
    record: deviceA,
    revokedReason: 'Desiste',
    revokedByUserId: 'user-2',
  })
  const afterRevoke = mergeConsentRecords([deviceA], [revokedIncoming])
  assert.equal(afterRevoke[0].status, 'revoked')
  assert.equal(afterRevoke[0].revokedReason, 'Desiste')
  assert.equal(afterRevoke[0].renderedTextSnapshot, snapshotText)

  const otherDraft = draftOrtodoncia({
    id: 'consent-implantes-1',
    templateId: 'implantes_dentales',
    title: 'Implantes dentales',
  })
  const otherSigned = signConsentRecord({
    record: otherDraft,
    textAccepted: true,
    patientSignatureDataUrl: 'data:image/png;base64,p2',
    professionalSignatureDataUrl: 'data:image/png;base64,o2',
  })
  const union = mergeConsentRecords([deviceA], [otherSigned])
  assert.equal(union.length, 2)
  assert.ok(union.some((item) => item.id === deviceA.id))
  assert.ok(union.some((item) => item.id === otherSigned.id))
})

test('getNormalizedConsents proyecta legado unificado en solo lectura sin destruirlo', () => {
  const legacy = {
    selectedConsentIds: ['ortodoncia_brackets', 'implantes_dentales'],
    textAccepted: true,
    patientSignatureDataUrl: 'data:image/png;base64,legacy-paciente',
    professionalSignatureDataUrl: 'data:image/png;base64,legacy-odonto',
    professionalLicense: '1097106893',
    professionalRegistry: '1097106893',
    signedAt: '2026-01-10T12:00:00.000Z',
    guardianName: '',
    guardianDocument: '',
  }

  const normalized = getNormalizedConsents({ informedConsent: legacy, informedConsents: [] })
  assert.equal(normalized.length, 2)
  assert.ok(normalized.every((item) => item.isLegacyUnified === true))
  assert.ok(normalized.every((item) => item.status === 'signed'))
  assert.equal(normalized[0].patientSignatureDataUrl, legacy.patientSignatureDataUrl)
  assert.equal(normalized[1].professionalDocument, '1097106893')
  assert.deepEqual(legacy.selectedConsentIds, ['ortodoncia_brackets', 'implantes_dentales'])

  const modern = signedOrtodoncia()
  const mixed = getNormalizedConsents({
    informedConsent: legacy,
    informedConsents: [modern],
  })
  assert.equal(mixed.filter((item) => item.templateId === 'ortodoncia_brackets').length, 1)
  assert.equal(mixed.filter((item) => item.templateId === 'implantes_dentales').length, 1)
})

test('Zod acepta informedConsents e informedConsent legacy sin rechazar historias previas', () => {
  const legacyOnly = parseClinicalConsentPayload({
    informedConsent: {
      selectedConsentIds: ['general_odonto'],
      textAccepted: true,
      professionalLicense: '1',
      professionalRegistry: '1',
    },
  })
  assert.equal(legacyOnly.success, true)

  const modern = signedOrtodoncia()
  const both = parseClinicalConsentPayload({
    informedConsent: { textAccepted: false, professionalLicense: '', professionalRegistry: '' },
    informedConsents: [modern],
  })
  assert.equal(both.success, true)

  const empty = parseClinicalConsentPayload({})
  assert.equal(empty.success, true)
})
