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
