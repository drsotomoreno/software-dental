export interface ClinicalSyncRecord {
  syncId: string
  clinicId: string
  updatedAt: string
  deletedAt?: string | null
  payload: Record<string, unknown>
}

export interface ClinicalSyncPullResponse {
  success?: boolean
  ok?: boolean
  clinicId?: string
  patients?: ClinicalSyncRecord[]
  appointments?: ClinicalSyncRecord[]
  serverTime?: string
  error?: string
}

export interface ClinicalSyncPushResponse {
  success?: boolean
  ok?: boolean
  clinicId?: string
  accepted?: { patients: number; appointments: number }
  serverTime?: string
  error?: string
}
