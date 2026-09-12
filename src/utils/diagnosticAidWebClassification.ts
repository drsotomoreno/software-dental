import type { DiagnosticAid, DiagnosticAidFileType } from '@/types/diagnosticAid'

export type DiagnosticAidWebCategory = 'mesh3d' | 'dicom' | 'media' | 'other'

const MESH3D_EXTENSIONS = new Set(['stl', 'ply', 'obj'])
const DICOM_EXTENSIONS = new Set(['dcm', 'dicom'])
const MEDIA_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'pdf', 'gif', 'webp', 'bmp', 'tif', 'tiff'])

export function getFileExtension(fileName: string): string {
  const parts = fileName.trim().toLowerCase().split('.')
  return parts.length > 1 ? (parts.pop() ?? '') : ''
}

export function classifyDiagnosticAidForWeb(fileName: string): DiagnosticAidWebCategory {
  const extension = getFileExtension(fileName)
  if (MESH3D_EXTENSIONS.has(extension)) return 'mesh3d'
  if (DICOM_EXTENSIONS.has(extension) || extension === 'zip') return 'dicom'
  if (MEDIA_EXTENSIONS.has(extension)) return 'media'
  return 'other'
}

export function isBrowserStoredDiagnosticAid(entry: Pick<DiagnosticAid, 'absolutePath' | 'blobId'>): boolean {
  return Boolean(entry.blobId) || entry.absolutePath.startsWith('[navegador]/')
}

export function hasLocalDiskPath(entry: Pick<DiagnosticAid, 'absolutePath'>): boolean {
  const path = entry.absolutePath.trim()
  if (!path || path.startsWith('[navegador]/')) return false
  return /^[A-Za-z]:\\/.test(path) || /^\\\\/.test(path) || path.startsWith('/')
}

export function shouldUseWebOpenMenu(entry: DiagnosticAid, desktop = false): boolean {
  if (!desktop) return true
  return isBrowserStoredDiagnosticAid(entry)
}

export function inferDiagnosticAidFileTypeFromName(fileName: string): DiagnosticAidFileType {
  const extension = getFileExtension(fileName)
  if (DICOM_EXTENSIONS.has(extension) || extension === 'zip') return 'DICOM'
  if (MESH3D_EXTENSIONS.has(extension)) return 'STL'
  if (MEDIA_EXTENSIONS.has(extension)) return 'IMG'
  return 'OTHER'
}

export function mimeTypeForDiagnosticFile(fileName: string): string {
  const extension = getFileExtension(fileName)
  const map: Record<string, string> = {
    stl: 'model/stl',
    ply: 'application/ply',
    obj: 'model/obj',
    dcm: 'application/dicom',
    dicom: 'application/dicom',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    bmp: 'image/bmp',
    tif: 'image/tiff',
    tiff: 'image/tiff',
    pdf: 'application/pdf',
    zip: 'application/zip',
  }
  return map[extension] ?? 'application/octet-stream'
}

function fallbackDownloadExtension(
  fileName: string,
  fileType?: DiagnosticAidFileType,
): string {
  const extension = getFileExtension(fileName)
  if (MESH3D_EXTENSIONS.has(extension)) return extension
  if (extension === 'zip') return 'zip'
  if (DICOM_EXTENSIONS.has(extension)) return extension === 'dicom' ? 'dcm' : extension
  if (MEDIA_EXTENSIONS.has(extension)) return extension
  if (extension) return extension
  if (fileType === 'DICOM') return 'dcm'
  if (fileType === 'IMG') return 'bin'
  if (fileType === 'OTHER') return 'bin'
  return 'stl'
}

function sanitizeDownloadBaseName(fileName: string): string {
  const stripped = fileName
    .trim()
    .replace(/^.*[/\\]/, '')
    .replace(/[<>:"|?*]/g, '_')
  return stripped || ''
}

export function resolveDiagnosticAidDownloadFileName(
  originalName: string | undefined | null,
  patientId: string,
  fileType?: DiagnosticAidFileType,
  date = new Date(),
): string {
  const sanitized = sanitizeDownloadBaseName(String(originalName ?? ''))
  if (sanitized && getFileExtension(sanitized)) {
    return sanitized
  }

  const extension = fallbackDownloadExtension(sanitized, fileType)
  const safePatient = (patientId.trim() || 'paciente').replace(/[^\w.-]+/g, '_')
  const stamp = Number.isNaN(date.getTime()) ? new Date() : date
  const isoDate = stamp.toISOString().slice(0, 10)
  return `escaneo_${safePatient}_${isoDate}.${extension}`
}
