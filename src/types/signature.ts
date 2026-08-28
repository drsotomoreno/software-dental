/** Metadatos de captura de firma dibujada en canvas (no imagen pegada) */
export interface SignatureCaptureMetadata {
  signatureMethod: 'canvas_biometric'
  strokeCount: number
  captureStartedAt: string
  captureEndedAt: string
  canvasWidth: number
  canvasHeight: number
}

export interface SignatureCaptureResult {
  dataUrl: string
  metadata: SignatureCaptureMetadata
}

/** Firma digital conforme Ley 527 de 1999 (Colombia) */
export interface DigitalSignature {
  id?: string
  recordId: string
  recordType: 'clinical_record' | 'consent' | 'budget' | 'addendum'
  signatureDataUrl: string
  /** Usuario autenticado que firmó — identificación inequívoca */
  authorUserId?: string
  authorEmail?: string
  sessionId?: string
  signatureMethod?: 'canvas_biometric'
  strokeCount?: number
  signedBy: string
  signedByDocument: string
  signedAt: string
  deviceInfo: string
  ipAddress?: string
  timezone?: string
  contentHash: string
  isValid: boolean
}

export interface SignatureMetadata {
  signedBy: string
  signedByDocument: string
  contentHash: string
  authorUserId: string
  sessionId: string
}

export const MIN_SIGNATURE_STROKES = 5
