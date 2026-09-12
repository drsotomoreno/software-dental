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
  tenant_id?: string
  patients?: ClinicalSyncRecord[]
  appointments?: ClinicalSyncRecord[]
  clinicalRecords?: ClinicalSyncRecord[]
  odontograms?: ClinicalSyncRecord[]
  diagnosticAids?: ClinicalSyncRecord[]
  attachments?: ClinicalSyncRecord[]
  drafts?: ClinicalSyncRecord[]
  sync_queue?: ClinicalSyncRecord[]
  serverTime?: string
  error?: string
}

export interface ClinicalSyncPushResponse {
  success?: boolean
  ok?: boolean
  clinicId?: string
  accepted?: {
    patients: number
    appointments: number
    clinicalRecords?: number
    odontograms?: number
    diagnosticAids?: number
    attachments?: number
    drafts?: number
    sync_queue?: number
  }
  serverTime?: string
  error?: string
}
