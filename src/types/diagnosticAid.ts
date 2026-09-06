/** Tipos de archivo para exámenes complementarios y escaneos */
export type DiagnosticAidFileType = 'DICOM' | 'STL' | 'IMG' | 'OTHER'

/** Clasificación para visores in-app (más fina que `fileType`). */
export type DiagnosticAidStudyKind = 'photo' | 'dicom2d' | 'dicomSeries' | 'mesh3d' | 'other'

export type DiagnosticAidViewerStatus = 'idle' | 'processing' | 'ready' | 'failed'

export type DiagnosticAidDerivativeKind = 'thumb' | 'glb' | 'dicom2d' | 'slice'

export type DiagnosticAidSlicePlane = 'axial' | 'coronal'

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
  studyKind?: DiagnosticAidStudyKind
  viewerStatus?: DiagnosticAidViewerStatus
  viewerError?: string
  /** Cortes axiales extraídos (tomografía). */
  sliceCount?: number
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

/** Derivado optimizado para visores móviles (GLB, WebP, miniatura). El original no se modifica. */
export interface DiagnosticAidDerivative {
  id: string
  aidId: string
  kind: DiagnosticAidDerivativeKind
  plane?: DiagnosticAidSlicePlane
  index?: number
  mimeType: string
  data: ArrayBuffer
  bytes: number
  createdAt: string
}

export const DIAGNOSTIC_AID_FILE_TYPE_LABELS: Record<DiagnosticAidFileType, string> = {
  DICOM: 'DICOM',
  STL: 'STL (CAD)',
  IMG: 'Imagen',
  OTHER: 'Otro',
}

export const DIAGNOSTIC_AID_STUDY_KIND_LABELS: Record<DiagnosticAidStudyKind, string> = {
  photo: 'Foto / Rx',
  dicom2d: 'DICOM 2D',
  dicomSeries: 'Tomografía',
  mesh3d: 'Modelo 3D',
  other: 'Archivo',
}

export const DIAGNOSTIC_AID_ACCEPT =
  '.dcm,.dicom,.stl,.ply,.obj,.jpg,.jpeg,.png,.gif,.webp,.bmp,.tif,.tiff,.pdf,.zip'
