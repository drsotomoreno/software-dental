/** Tipos de archivo para exámenes complementarios y escaneos */
export type DiagnosticAidFileType = 'DICOM' | 'STL' | 'IMG' | 'OTHER'

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

export const DIAGNOSTIC_AID_FILE_TYPE_LABELS: Record<DiagnosticAidFileType, string> = {
  DICOM: 'DICOM',
  STL: 'STL (CAD)',
  IMG: 'Imagen',
  OTHER: 'Otro',
}

export const DIAGNOSTIC_AID_ACCEPT =
  '.dcm,.dicom,.stl,.ply,.obj,.jpg,.jpeg,.png,.gif,.webp,.bmp,.tif,.tiff,.pdf,.zip'
