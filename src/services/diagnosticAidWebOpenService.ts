import { logAuditEvent } from '@/services/auditService'
import {
  downloadDiagnosticAidBlob,
  getDiagnosticAidBlobUrl,
} from '@/services/diagnosticAidBlobStore'
import type { DiagnosticAid } from '@/types/diagnosticAid'
import type { UserProfile } from '@/types/user'
import {
  classifyDiagnosticAidForWeb,
  getFileExtension,
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
  const hasBlob = Boolean(entry.blobId)

  if (category === 'mesh3d') {
    return [
      { id: 'open_exocad_webview', label: 'Abrir en exocad webview', icon: 'globe' },
      {
        id: 'download_mesh',
        label: meshDownloadLabel(entry.fileName),
        icon: 'download',
        disabled: !hasBlob,
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
        disabled: !hasBlob,
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
        disabled: !entry.blobId,
      },
      {
        id: 'download_media',
        label: 'Descargar archivo',
        icon: 'download',
        disabled: !entry.blobId,
      },
    ]
  }

  return [
    {
      id: 'download_media',
      label: 'Descargar archivo',
      icon: 'download',
      disabled: !entry.blobId,
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
        const blobUrl = entry.blobId ? await getDiagnosticAidBlobUrl(entry.id) : null
        if (blobUrl) {
          window.open(blobUrl, '_blank', 'noopener,noreferrer')
        }
        openExternalTab(EXOCAD_WEBVIEW_URL)
        await auditWebOpen(
          entry,
          action,
          true,
          `${entry.fileName} — exocad webview${blobUrl ? ' + blob' : ''}`,
          user,
        )
        return {
          ok: true,
          message: blobUrl
            ? 'Escaneo abierto en nueva pestaña. También puede importarlo en exocad webview.'
            : 'Visor exocad webview abierto. Descargue el escaneo si necesita importarlo.',
        }
      }

      case 'download_mesh':
      case 'download_dicom':
      case 'download_media': {
        if (!entry.blobId) {
          const message =
            'No hay copia local del archivo en el navegador. Vuelva a cargar el estudio para habilitar la descarga.'
          await auditWebOpen(entry, action, false, message, user)
          return { ok: false, message }
        }
        const downloaded = await downloadDiagnosticAidBlob(entry.id, entry.fileName)
        if (!downloaded) {
          const message = 'No se encontró el archivo almacenado en este navegador.'
          await auditWebOpen(entry, action, false, message, user)
          return { ok: false, message }
        }
        await auditWebOpen(entry, action, true, `Descarga: ${entry.fileName}`, user)
        return { ok: true, message: `Descargando ${entry.fileName}…` }
      }

      case 'open_dicom_viewer': {
        openExternalTab(DICOM_VIEWER_ONLINE_URL)
        if (entry.blobId) {
          await downloadDiagnosticAidBlob(entry.id, entry.fileName)
        }
        await auditWebOpen(entry, action, true, `${entry.fileName} — dicomviewer.net`, user)
        return {
          ok: true,
          message: entry.blobId
            ? 'Visor DICOM abierto. El archivo se descargó para importarlo en el visor.'
            : 'Visor DICOM online abierto en una nueva pestaña.',
        }
      }

      case 'preview_media': {
        if (!entry.blobId) {
          const message = 'Vista previa no disponible. Vuelva a cargar el archivo en este navegador.'
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
