export type SyncQueueEntityType = 'diagnostic_aid' | 'clinical_attachment'

export type SyncQueueStatus = 'pending' | 'synced' | 'error'

/** Ítem de la cola de sincronización de adjuntos (STL, PDF, DICOM, imágenes). */
export interface SyncQueueAttachment {
  id: string
  entityType: SyncQueueEntityType
  action?: 'CREATE' | 'UPSERT'
  status: SyncQueueStatus
  patientId: string
  /** ID de evolución / encuentro clínico. */
  encounterId: string
  patientSyncId?: string
  aidId: string
  blobId?: string | null
  fileName: string
  fileHash: string
  mimeType: string
  absolutePath?: string
  /** Presente al viajar por la API; no se persiste en IndexedDB para ahorrar espacio. */
  dataBase64?: string
  byteLength?: number
  clinicId?: string
  createdAt: string
  updatedAt: string
  lastSyncedAt?: string
  error?: string
}
