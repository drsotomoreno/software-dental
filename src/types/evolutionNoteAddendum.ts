import type { SignatureCaptureMetadata } from '@/types/signature'

/** Nota aclaratoria vinculada a una evolución firmada (registro independiente, append-only). */
export interface EvolutionNoteAddendum {
  id: string
  patientId: string
  /** Registro clínico firmado, si aplica. */
  parentRecordId?: string
  parentEvolutionNoteId: string
  parentEvolutionNoteHash: string
  reason: string
  content: string
  authorUserId: string
  authorEmail: string
  authorName: string
  authorDocument: string
  professionalLicense?: string
  professionalSignatureDataUrl: string
  professionalSignatureMeta: SignatureCaptureMetadata
  /** SHA-256 del contenido (Ley 527 de 1999). */
  contentHash: string
  /** Marca de tiempo UTC ISO-8601. */
  signedAt: string
  createdAt: string
  deviceInfo?: string
  ipAddress?: string
  timezone?: string
}
