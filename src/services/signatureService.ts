import { db } from '@/db/database'
import type { AuthUser } from '@/types/auth'
import type { ClinicalRecord } from '@/types/clinicalRecord'
import type { StoredConsentSignatures } from '@/types/consent'
import {
  MIN_SIGNATURE_STROKES,
  type DigitalSignature,
  type SignatureCaptureMetadata,
  type SignatureCaptureResult,
} from '@/types/signature'
import { collectSignatureContext } from '@/utils/clientContext'

export interface CreateSignatureInput {
  recordId: string
  recordType: DigitalSignature['recordType']
  capture: SignatureCaptureResult
  contentHash: string
  user: AuthUser
  signedByName: string
  signedByDocument: string
}

export async function createDigitalSignature(input: CreateSignatureInput): Promise<string> {
  const context = await collectSignatureContext()
  const now = context.capturedAt

  const signature: DigitalSignature = {
    recordId: input.recordId,
    recordType: input.recordType,
    signatureDataUrl: input.capture.dataUrl,
    authorUserId: input.user.id,
    authorEmail: input.user.email,
    sessionId: input.user.sessionId,
    signatureMethod: 'canvas_biometric',
    strokeCount: input.capture.metadata.strokeCount,
    signedBy: input.signedByName,
    signedByDocument: input.signedByDocument,
    signedAt: now,
    deviceInfo: context.userAgent,
    ipAddress: context.ipAddress,
    timezone: context.timezone,
    contentHash: input.contentHash,
    isValid: true,
  }

  const id = await db.signatures.add(signature)
  return String(id)
}

export function signatureMetadataFromRow(
  row:
    | Pick<DigitalSignature, 'signatureDataUrl' | 'signatureMethod' | 'strokeCount' | 'signedAt'>
    | undefined,
): SignatureCaptureMetadata | undefined {
  if (!row?.signatureDataUrl) return undefined
  if (row.signatureMethod && row.signatureMethod !== 'canvas_biometric') return undefined
  const strokeCount = row.strokeCount ?? 0
  if (strokeCount < MIN_SIGNATURE_STROKES) return undefined
  return {
    signatureMethod: 'canvas_biometric',
    strokeCount,
    captureStartedAt: row.signedAt,
    captureEndedAt: row.signedAt,
    canvasWidth: 400,
    canvasHeight: 150,
  }
}

/** Recupera las imágenes si el consentimiento quedó firmado pero sin el data URL. */
export async function findLedgerConsentSignatures(
  records: Array<Pick<ClinicalRecord, 'id' | 'informedConsent' | 'signedAt'>>,
): Promise<StoredConsentSignatures | null> {
  for (const record of records) {
    if (record.id == null) continue
    const rows = await db.signatures.where('recordId').equals(String(record.id)).toArray()
    const newestFirst = [...rows].sort((a, b) => (b.signedAt ?? '').localeCompare(a.signedAt ?? ''))
    const patient = newestFirst.find((row) => row.recordType === 'consent' && row.signatureDataUrl)
    const professional = newestFirst.find(
      (row) => row.recordType === 'clinical_record' && row.signatureDataUrl,
    )
    const patientDataUrl =
      patient?.signatureDataUrl || record.informedConsent?.patientSignatureDataUrl
    const professionalDataUrl =
      professional?.signatureDataUrl ||
      record.informedConsent?.professionalSignatureDataUrl
    if (!patientDataUrl && !professionalDataUrl) continue
    return {
      selectedConsentIds: record.informedConsent?.selectedConsentIds,
      patientSignatureDataUrl: patientDataUrl,
      patientSignatureMeta:
        record.informedConsent?.patientSignatureMeta ?? signatureMetadataFromRow(patient),
      professionalSignatureDataUrl: professionalDataUrl,
      professionalSignatureMeta:
        record.informedConsent?.professionalSignatureMeta ??
        signatureMetadataFromRow(professional),
      signedAt: record.informedConsent?.signedAt ?? record.signedAt ?? patient?.signedAt,
      textAccepted: record.informedConsent?.textAccepted === true,
    }
  }
  return null
}

export function validateSignatureCapture(
  capture: SignatureCaptureResult | null | undefined,
): string | null {
  if (!capture?.dataUrl) return 'Debe firmar dibujando en el canvas.'
  if (capture.metadata.signatureMethod !== 'canvas_biometric') {
    return 'Solo se aceptan firmas capturadas en el dispositivo.'
  }
  if (capture.metadata.strokeCount < 5) {
    return 'La firma debe realizarse trazando al menos 5 trazos en el canvas.'
  }
  return null
}
