export type AddendumType = 'aclaratoria' | 'adenda'

export interface ClinicalRecordAddendum {
  id?: number | string
  parentRecordId: string
  patientId: string
  type: AddendumType
  reason: string
  content: string
  authorUserId: string
  authorEmail: string
  authorName: string
  authorDocument: string
  authorLicense?: string
  sessionId: string
  parentRecordHash: string
  contentHash: string
  signedAt: string
  createdAt: string
  deviceInfo: string
  ipAddress?: string
  timezone: string
}

export const ADDENDUM_TYPE_LABELS: Record<AddendumType, string> = {
  aclaratoria: 'Nota aclaratoria',
  adenda: 'Adenda',
}
