import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'
import { clinicalSealsEqual } from '../../shared/clinicalSeal.js'
import { imageSha256OfDataUrl } from '../../shared/signatureDriveRef.js'
import { sha256HexBytes } from '../../shared/sha256Hex.js'
import { offloadSignaturesInPayload } from './signatureDriveService.js'

function pngDataUrl(bytes) {
  return `data:image/png;base64,${Buffer.from(bytes).toString('base64')}`
}

test('sha256 de la firma coincide con node:crypto', () => {
  const bytes = Buffer.from('firma-png-bytes')
  const expected = createHash('sha256').update(bytes).digest('hex')
  assert.equal(sha256HexBytes(new Uint8Array(bytes)), expected)
  assert.equal(imageSha256OfDataUrl(pngDataUrl('firma-png-bytes')), expected)
  assert.equal(sha256HexBytes(''), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
})

test('extrae data:image/png;base64 y lo sustituye por /api/drive/file', async () => {
  const png = pngDataUrl('firma-paciente'.repeat(400))
  const payload = {
    patients: [
      {
        syncId: 'pac-1',
        patientId: 'pac-1',
        payload: {
          clinicalDraft: {
            informedConsent: { patientSignatureDataUrl: png },
          },
          valuationDraft: {
            treatingDentistSignature: { signatureDataUrl: pngDataUrl('firma-tratante'.repeat(400)) },
          },
        },
      },
    ],
    diagnosticAids: [{ dataUrl: png, fileName: 'radio.png' }],
  }
  const uploads = []
  const result = await offloadSignaturesInPayload(payload, {
    clinicId: 'clinic:demo',
    isDriveConnected: async () => true,
    uploadSignature: async (input) => {
      uploads.push(input.fileName)
      return { driveFileId: `file-${uploads.length}` }
    },
  })

  const consent = result.payload.patients[0].payload.clinicalDraft.informedConsent
  assert.equal(uploads.length, 2)
  assert.match(uploads[0], /^firma_pac-1_patientSignatureDataUrl_/)
  assert.match(consent.patientSignatureDataUrl, /^\/api\/drive\/file\/file-1\?mimeType=image%2Fpng$/)
  assert.equal(consent.patientSignatureDrive.driveFileId, 'file-1')
  assert.equal(consent.patientSignatureDrive.pendingRetry, false)
  assert.equal(typeof consent.patientSignatureDrive.uploadedAt, 'string')
  assert.equal(consent.patientSignatureDataUrl.includes('base64'), false)
  const treating = result.payload.patients[0].payload.valuationDraft.treatingDentistSignature
  assert.match(treating.signatureDataUrl, /^\/api\/drive\/file\/file-2/)
  assert.equal(result.payload.diagnosticAids[0].dataUrl, png)
  assert.equal(result.migrated, 2)
  assert.ok(result.bytesSaved > 0)
  assert.equal(payload.patients[0].payload.clinicalDraft.informedConsent.patientSignatureDataUrl, png)
})

test('informedConsents[] individual: offload + patientSignatureDriveId sin romper sello', async () => {
  const patientPng = pngDataUrl('firma-consent-paciente'.repeat(200))
  const proPng = pngDataUrl('firma-consent-odonto'.repeat(200))
  const payload = {
    clinicalDraft: {
      informedConsents: [
        {
          id: 'c-orto',
          templateId: 'ortodoncia_brackets',
          status: 'signed',
          signedAt: '2026-11-21T12:00:00.000Z',
          contentHash: 'a'.repeat(64),
          patientSignatureDataUrl: patientPng,
          professionalSignatureDataUrl: proPng,
        },
      ],
      informedConsent: {
        selectedConsentIds: ['ortodoncia_brackets'],
        patientSignatureDataUrl: pngDataUrl('legacy-unificado'.repeat(100)),
      },
    },
  }
  const result = await offloadSignaturesInPayload(payload, {
    clinicId: 'clinic:demo',
    isDriveConnected: async () => true,
    uploadSignature: async () => ({ driveFileId: `drive-${Math.random().toString(16).slice(2, 8)}` }),
  })
  const row = result.payload.clinicalDraft.informedConsents[0]
  assert.match(row.patientSignatureDataUrl, /^\/api\/drive\/file\//)
  assert.match(row.professionalSignatureDataUrl, /^\/api\/drive\/file\//)
  assert.equal(typeof row.patientSignatureDriveId, 'string')
  assert.ok(row.patientSignatureDriveId.length > 0)
  assert.equal(typeof row.professionalSignatureDriveId, 'string')
  assert.equal(row.signedAt, '2026-11-21T12:00:00.000Z')
  assert.equal(row.contentHash, 'a'.repeat(64))
  assert.equal(row.patientSignatureDataUrl.includes('base64'), false)
  const legacy = result.payload.clinicalDraft.informedConsent
  assert.match(legacy.patientSignatureDataUrl, /^\/api\/drive\/file\//)
  assert.ok(result.migrated >= 3)
})

test('sin Drive conectado conserva el base64 y lo marca para reintento', async () => {
  const png = pngDataUrl('firma-sin-drive')
  let uploads = 0
  const result = await offloadSignaturesInPayload(
    { informedConsent: { professionalSignatureDataUrl: png } },
    {
      clinicId: 'clinic:demo',
      isDriveConnected: async () => false,
      uploadSignature: async () => {
        uploads += 1
        return { driveFileId: 'no' }
      },
    },
  )
  assert.equal(uploads, 0)
  assert.equal(result.migrated, 0)
  assert.equal(result.pending, 1)
  assert.equal(result.payload.informedConsent.professionalSignatureDataUrl, png)
  assert.equal(result.payload.informedConsent.professionalSignatureDrive.pendingRetry, true)
  assert.equal(
    result.payload.informedConsent.professionalSignatureDrive.pendingReason,
    'drive_not_connected',
  )
})

test('una firma que ya es /api/drive/file es idempotente', async () => {
  const ref = '/api/drive/file/abc123?mimeType=image%2Fpng'
  let uploads = 0
  const result = await offloadSignaturesInPayload(
    {
      evolutionNotes: [{ professionalSignatureDataUrl: ref }],
      informedConsent: {
        patientSignatureDataUrl: '/api/integrations/google-drive/file/legacy1',
      },
    },
    {
      clinicId: 'clinic:demo',
      isDriveConnected: async () => true,
      uploadSignature: async () => {
        uploads += 1
        return { driveFileId: 'nuevo' }
      },
    },
  )
  assert.equal(uploads, 0)
  assert.equal(result.migrated, 0)
  assert.equal(result.skipped, 2)
  assert.equal(result.payload.evolutionNotes[0].professionalSignatureDataUrl, ref)
  assert.equal(
    result.payload.informedConsent.patientSignatureDataUrl,
    '/api/integrations/google-drive/file/legacy1',
  )
})

test('el sello clínico no cambia al sustituir el PNG por su referencia de Drive', () => {
  const png = pngDataUrl('firma-sello')
  const hex = imageSha256OfDataUrl(png)
  const stored = {
    payload: {
      signedAt: '2026-11-01T12:00:00.000Z',
      treatingDentistSignature: {
        signedAt: '2026-11-01T12:00:00.000Z',
        signatureDataUrl: png,
        professionalName: 'Dr. Soto',
      },
    },
  }
  const offloaded = {
    payload: {
      signedAt: '2026-11-01T12:00:00.000Z',
      treatingDentistSignature: {
        signedAt: '2026-11-01T12:00:00.000Z',
        signatureDataUrl: '/api/drive/file/sello?mimeType=image%2Fpng',
        signatureDrive: { imageSha256: hex, driveFileId: 'sello' },
        professionalName: 'Dr. Soto',
      },
    },
  }
  assert.equal(clinicalSealsEqual(stored, offloaded), true)
  offloaded.payload.treatingDentistSignature.signatureDrive.imageSha256 = 'f'.repeat(64)
  assert.equal(clinicalSealsEqual(stored, offloaded), false)
})
