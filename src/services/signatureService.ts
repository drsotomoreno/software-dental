import { db } from '@/db/database'
import type { AuthUser } from '@/types/auth'
import type { SignatureCaptureResult } from '@/types/signature'
import type { DigitalSignature } from '@/types/signature'
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
