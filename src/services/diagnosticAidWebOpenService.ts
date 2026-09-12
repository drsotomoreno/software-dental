import { logAuditEvent } from '@/services/auditService'
import {
  downloadDiagnosticAidBlob,
  getDiagnosticAidBlobUrl,
} from '@/services/diagnosticAidBlobStore'
import { ensureLocalDiagnosticAidBlob } from '@/services/diagnosticAidRemoteStore'
import type { DiagnosticAid } from '@/types/diagnosticAid'
import type { UserProfile } from '@/types/user'
import {
  classifyDiagnosticAidForWeb,
  getFileExtension,
  resolveDiagnosticAidDownloadFileName,
} from '@/utils/diagnosticAidWebClassification'

export const EXOCAD_WEBVIEW_URL = 'https://webview.dental/'
export const DICOM_VIEWER_ONLINE_URL = 'https://dicomviewer.net/'

export type DiagnosticAidWebAction =
  | 'open_exocad_webview'
  | 'download_mesh'
  | 'open_dicom_viewer'
  | 'download_dicom'
  | 'preview_media'
  | 'download_media'

export interface DiagnosticAidWebActionResult {
  ok: boolean
  message: string
  previewUrl?: string
  previewKind?: 'image' | 'pdf'
}

async function auditWebOpen(
  entry: DiagnosticAid,
  action: DiagnosticAidWebAction,
  success: boolean,
  details: string,
  user?: UserProfile | null,
): Promise<void> {
  await logAuditEvent({
    action: 'OPEN_DIAGNOSTIC_AID',
    resourceType: 'diagnostic_aid',
    resourceId: entry.id,
    details: `[web:${action}] ${details}`,
    success,
    user: user ?? null,
  })
}

function openExternalTab(url: string): void {
  window.open(url, '_blank', 'noopener,noreferrer')
}

function downloadNameFor(entry: DiagnosticAid): string {
  return resolveDiagnosticAidDownloadFileName(entry.fileName, entry.patientId, entry.fileType)
}

async function downloadStoredBlob(entry: DiagnosticAid): Promise<boolean> {
  const local = await ensureLocalDiagnosticAidBlob(entry)
  if (!local) return false
  return downloadDiagnosticAidBlob(entry.id, entry.fileName, {
    patientId: entry.patientId,
    fileType: entry.fileType,
  })
}

function meshDownloadLabel(fileName: string): string {
  const extension = getFileExtension(fileName)
  if (extension === 'ply') return 'Descargar escaneo (.ply)'
  if (extension === 'obj') return 'Descargar escaneo (.obj)'
  return 'Descargar escaneo (.stl)'
}

export function getWebOpenActions(entry: DiagnosticAid): Array<{
  id: DiagnosticAidWebAction
  label: string
  icon: 'globe' | 'download' | 'eye'
  disabled?: boolean
}> {
  const category = classifyDiagnosticAidForWeb(entry.fileName)

  if (category === 'mesh3d') {
    return [
      { id: 'open_exocad_webview', label: 'Abrir en exocad webview', icon: 'globe' },
      {
        id: 'download_mesh',
        label: meshDownloadLabel(entry.fileName),
        icon: 'download',
      },
    ]
  }

  if (category === 'dicom') {
    return [
      { id: 'open_dicom_viewer', label: 'Abrir en Visor DICOM Online', icon: 'globe' },
      {
        id: 'download_dicom',
        label: 'Descargar archivo / carpeta DICOM (.zip)',
        icon: 'download',
      },
    ]
  }

  if (category === 'media') {
    const extension = getFileExtension(entry.fileName)
    const isPdf = extension === 'pdf'
    return [
      {
        id: 'preview_media',
        label: isPdf ? 'Vista previa rápida (PDF)' : 'Vista previa rápida',
        icon: 'eye',
      },
      {
        id: 'download_media',
        label: 'Descargar archivo',
        icon: 'download',
      },
    ]
  }

  return [
    {
      id: 'download_media',
      label: 'Descargar archivo',
      icon: 'download',
    },
  ]
}

export async function executeDiagnosticAidWebAction(
  entry: DiagnosticAid,
  action: DiagnosticAidWebAction,
  user?: UserProfile | null,
): Promise<DiagnosticAidWebActionResult> {
  try {
    switch (action) {
      case 'open_exocad_webview': {
        const downloaded = await downloadStoredBlob(entry)
        openExternalTab(EXOCAD_WEBVIEW_URL)
        await auditWebOpen(
          entry,
          action,
          true,
          `${downloadNameFor(entry)} — exocad webview${downloaded ? ' + descarga' : ''}`,
          user,
        )
        return {
          ok: true,
          message: downloaded
            ? 'Visor exocad webview abierto. El escaneo se descargó con su extensión para importarlo.'
            : 'Visor exocad webview abierto. Descargue el escaneo si necesita importarlo.',
        }
      }

      case 'download_mesh':
      case 'download_dicom':
      case 'download_media': {
        const fileName = downloadNameFor(entry)
        const downloaded = await downloadStoredBlob(entry)
        if (!downloaded) {
          const message = 'No se encontró el archivo en este equipo ni en el snapshot de la clínica.'
          await auditWebOpen(entry, action, false, message, user)
          return { ok: false, message }
        }
        await auditWebOpen(entry, action, true, `Descarga: ${fileName}`, user)
        return { ok: true, message: `Descargando ${fileName}…` }
      }

      case 'open_dicom_viewer': {
        openExternalTab(DICOM_VIEWER_ONLINE_URL)
        const downloaded = await downloadStoredBlob(entry)
        await auditWebOpen(entry, action, true, `${downloadNameFor(entry)} — dicomviewer.net`, user)
        return {
          ok: true,
          message: downloaded
            ? 'Visor DICOM abierto. El archivo se descargó con su extensión para importarlo en el visor.'
            : 'Visor DICOM online abierto en una nueva pestaña.',
        }
      }

      case 'preview_media': {
        const local = await ensureLocalDiagnosticAidBlob(entry)
        if (!local) {
          const message = 'No se pudo descargar la vista previa desde la clínica.'
          await auditWebOpen(entry, action, false, message, user)
          return { ok: false, message }
        }
        const previewUrl = await getDiagnosticAidBlobUrl(entry.id)
        if (!previewUrl) {
          const message = 'No se pudo generar la vista previa.'
          await auditWebOpen(entry, action, false, message, user)
          return { ok: false, message }
        }
        const extension = getFileExtension(entry.fileName)
        await auditWebOpen(entry, action, true, `Vista previa: ${entry.fileName}`, user)
        return {
          ok: true,
          message: 'Vista previa lista.',
          previewUrl,
          previewKind: extension === 'pdf' ? 'pdf' : 'image',
        }
      }

      default:
        return { ok: false, message: 'Acción no reconocida.' }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo completar la acción.'
    await auditWebOpen(entry, action, false, message, user)
    return { ok: false, message }
  }
}
