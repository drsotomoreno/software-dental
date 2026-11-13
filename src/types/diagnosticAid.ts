/** Tipos de archivo para exámenes complementarios y escaneos */
export type DiagnosticAidFileType = 'DICOM' | 'STL' | 'IMG' | 'OTHER'

export type DiagnosticAidDriveUploadStatus =
  | 'pending'
  | 'uploading'
  | 'uploaded'
  | 'error'
  | 'local_only'

/**
 * Modelo `diagnostic_aids` — almacenamiento local de referencias a archivos
 * (DICOM, STL, imágenes, etc.) sin cargar el binario en la aplicación.
 */
export interface DiagnosticAid {
  /** UUID */
  id: string
  patientId: string
  /** ID del encuentro / historia clínica (registro firmado o borrador) */
  encounterId: string
  fileType: DiagnosticAidFileType
  fileName: string
  /** Ruta absoluta en el disco del equipo (Electron) o marcador `[navegador]/archivo` */
  absolutePath: string
  /** Copia local en IndexedDB cuando se carga desde el navegador web */
  blobId?: string | null
  /** SHA-256 del archivo al momento del registro (integridad legal) */
  fileHash: string
  /** ISO 8601 — alta en el sistema */
  createdAt: string
  /** ISO 8601 — fecha/hora de recepción del estudio (puede diferir del alta) */
  receivedAt?: string
  comments: string
  clinicId?: string
  patientSyncId?: string
  pendingSync?: boolean
  lastSyncedAt?: string
  /** Metadatos Google Drive (bytes en la nube; IndexedDB es caché offline). */
  driveFileId?: string | null
  webViewLink?: string | null
  storageBackend?: 'google_drive' | 'indexeddb' | 'disk' | null
  driveUploadStatus?: DiagnosticAidDriveUploadStatus | null
  driveUploadError?: string | null
}

/** Copia binaria local para archivos cargados desde el navegador web */
export interface DiagnosticAidBlobRecord {
  id: string
  aidId: string
  fileName: string
  mimeType: string
  data: ArrayBuffer
  createdAt: string
}

/** Tumba local: evita que el merge del sync reinserta un examen ya quitado (F5). */
export interface DeletedDiagnosticAidTombstone {
  id: string
  clinicId?: string
  fileName?: string
  deletedAt: string
}

export const DIAGNOSTIC_AID_FILE_TYPE_LABELS: Record<DiagnosticAidFileType, string> = {
  DICOM: 'DICOM',
  STL: 'STL (CAD)',
  IMG: 'Imagen',
  OTHER: 'Otro',
}

export const DIAGNOSTIC_AID_ACCEPT =
  '.dcm,.dicom,.stl,.ply,.obj,.jpg,.jpeg,.png,.gif,.webp,.bmp,.tif,.tiff,.pdf,.zip'
