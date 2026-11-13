import { db } from '@/db/database'
import { getStoredApiAuth } from '@/services/apiAuthService'
import { getDiagnosticAidBlobByAidId } from '@/services/diagnosticAidBlobStore'
import {
  driveClinicQuery,
  driveIdentityHeaders,
  resolveActiveDriveClinicId,
} from '@/services/googleDriveClinicContext'
import {
  isGoogleDriveRequiredResponse,
  notifyGoogleDriveRequired,
} from '@/services/globalToast'
import { enqueueDiagnosticAidForSync } from '@/services/syncQueueService'
import type { DiagnosticAid } from '@/types/diagnosticAid'
import { mimeTypeForDiagnosticFile } from '@/utils/diagnosticAidWebClassification'

export const DIAGNOSTIC_AID_MAX_UPLOAD_BYTES = 100 * 1024 * 1024

export type DriveUploadProgress = {
  aidId: string
  phase: 'checking' | 'uploading' | 'done' | 'error' | 'skipped'
  message: string
}

type DriveStatusPayload = {
  connected?: boolean
  status?: string
  clinicId?: string | null
  error?: string
  code?: string
}

async function readDriveStatus(): Promise<{
  connected: boolean
  clinicId: string | null
  message: string | null
}> {
  const auth = getStoredApiAuth()
  const clinicId = resolveActiveDriveClinicId()
  if (!auth?.token) {
    return {
      connected: false,
      clinicId: null,
      message: 'Sesión inválida o expirada. Vuelva a iniciar sesión para subir a Google Drive.',
    }
  }
  try {
    const response = await fetch(`/api/integrations/google-drive/status${driveClinicQuery(clinicId)}`, {
      headers: driveIdentityHeaders(clinicId),
    })
    const body = (await response.json().catch(() => ({}))) as DriveStatusPayload
    if (response.status === 401) {
      return {
        connected: false,
        clinicId: null,
        message: 'Sesión inválida o expirada. Vuelva a iniciar sesión.',
      }
    }
    if (!response.ok) {
      return {
        connected: false,
        clinicId: typeof body.clinicId === 'string' ? body.clinicId : clinicId || null,
        message:
          typeof body.error === 'string'
            ? body.error
            : `No se pudo verificar Google Drive (HTTP ${response.status}).`,
      }
    }
    const connected = Boolean(body.connected) || body.status === 'connected'
    return {
      connected,
      clinicId:
        (typeof body.clinicId === 'string' && body.clinicId.trim()) || clinicId || null,
      message: connected
        ? null
        : 'Google Drive no está conectado. Conéctelo en Perfil → Google Drive.',
    }
  } catch (error) {
    return {
      connected: false,
      clinicId: clinicId || null,
      message:
        error instanceof Error
          ? `No se pudo verificar Google Drive: ${error.message}`
          : 'No se pudo verificar Google Drive.',
    }
  }
}

async function markUploadError(aidId: string, message: string): Promise<DiagnosticAid | undefined> {
  await db.diagnosticAids.update(aidId, {
    driveUploadStatus: 'error',
    driveUploadError: message,
    storageBackend: 'indexeddb',
  })
  return db.diagnosticAids.get(aidId)
}

/**
 * Sube (o reintenta) un examen complementario a Google Drive vía multipart.
 * Envía clinicId en query, FormData y header X-Clinic-Id (igual que /perfil).
 */
export async function uploadDiagnosticAidToGoogleDrive(
  entry: DiagnosticAid,
  onProgress?: (progress: DriveUploadProgress) => void,
): Promise<DiagnosticAid> {
  const aidId = entry.id
  const emit = (phase: DriveUploadProgress['phase'], message: string) => {
    onProgress?.({ aidId, phase, message })
  }

  if (entry.driveFileId && entry.webViewLink && entry.driveUploadStatus === 'uploaded') {
    emit('done', 'Ya estaba en Google Drive.')
    return entry
  }

  emit('checking', 'Verificando Google Drive…')
  await db.diagnosticAids.update(aidId, {
    driveUploadStatus: 'uploading',
    driveUploadError: null,
  })

  const status = await readDriveStatus()
  if (!status.connected) {
    const message =
      status.message ||
      'Google Drive no está conectado. Conéctelo en Perfil → Google Drive.'
    const failed = await markUploadError(aidId, message)
    emit('error', message)
    return failed ?? { ...entry, driveUploadStatus: 'error', driveUploadError: message }
  }

  const blobRecord = await getDiagnosticAidBlobByAidId(aidId)
  if (!blobRecord?.data) {
    const message =
      'No hay copia local del archivo para subir a Google Drive. Elimínelo y vuelva a adjuntarlo.'
    const failed = await markUploadError(aidId, message)
    emit('error', message)
    return failed ?? { ...entry, driveUploadStatus: 'error', driveUploadError: message }
  }

  if (blobRecord.data.byteLength > DIAGNOSTIC_AID_MAX_UPLOAD_BYTES) {
    const message = `El archivo supera el límite de ${Math.round(DIAGNOSTIC_AID_MAX_UPLOAD_BYTES / (1024 * 1024))} MB.`
    const failed = await markUploadError(aidId, message)
    emit('error', message)
    return failed ?? { ...entry, driveUploadStatus: 'error', driveUploadError: message }
  }

  emit('uploading', 'Subiendo a Google Drive…')
  const clinicId = String(
    status.clinicId || entry.clinicId || resolveActiveDriveClinicId() || '',
  ).trim()

  try {
    const mimeType = blobRecord.mimeType || mimeTypeForDiagnosticFile(entry.fileName)
    const form = new FormData()
    form.append(
      'file',
      new Blob([blobRecord.data as BlobPart], { type: mimeType }),
      entry.fileName || 'archivo.bin',
    )
    form.append('aidId', aidId)
    form.append('fileName', entry.fileName)
    form.append('mimeType', mimeType)
    form.append('patientSyncId', entry.patientSyncId || entry.patientId || 'sin-paciente')
    if (clinicId) form.append('clinicId', clinicId)
    if (entry.driveFileId) form.append('driveFileId', entry.driveFileId)

    const controller = new AbortController()
    const timeoutMs = 45_000
    const timer = window.setTimeout(() => controller.abort(), timeoutMs)
    let response: Response
    try {
      response = await fetch(
        `/api/integrations/google-drive/upload${driveClinicQuery(clinicId)}`,
        {
          method: 'POST',
          headers: driveIdentityHeaders(clinicId),
          body: form,
          signal: controller.signal,
        },
      )
    } catch (error) {
      window.clearTimeout(timer)
      const aborted =
        (error instanceof DOMException && error.name === 'AbortError') ||
        (error instanceof Error && /aborted|AbortError/i.test(error.message))
      const message = aborted
        ? `La subida a Google Drive superó ${Math.round(timeoutMs / 1000)} s. Reintente con «Subir a Drive».`
        : error instanceof Error
          ? error.message
          : 'No se pudo subir el archivo a Google Drive.'
      const failed = await markUploadError(aidId, message)
      emit('error', message)
      return failed ?? { ...entry, driveUploadStatus: 'error', driveUploadError: message }
    } finally {
      window.clearTimeout(timer)
    }
    const body = await response.json().catch(() => ({}))

    if (isGoogleDriveRequiredResponse(response, body)) {
      notifyGoogleDriveRequired()
      const message =
        typeof body?.error === 'string'
          ? body.error
          : 'La clínica debe conectar Google Drive antes de subir adjuntos.'
      const failed = await markUploadError(aidId, message)
      emit('error', message)
      return failed ?? { ...entry, driveUploadStatus: 'error', driveUploadError: message }
    }

    if (response.status === 401) {
      const message =
        typeof body?.error === 'string'
          ? body.error
          : 'Sesión inválida o expirada. Vuelva a iniciar sesión.'
      const failed = await markUploadError(aidId, message)
      emit('error', message)
      return failed ?? { ...entry, driveUploadStatus: 'error', driveUploadError: message }
    }

    if (!response.ok || !body?.driveFileId) {
      const message =
        typeof body?.error === 'string'
          ? body.error
          : `Error al subir a Google Drive (HTTP ${response.status}).`
      const failed = await markUploadError(aidId, message)
      emit('error', message)
      return failed ?? { ...entry, driveUploadStatus: 'error', driveUploadError: message }
    }

    const driveFileId = String(body.driveFileId)
    const webViewLink =
      String(body.webViewLink || '').trim() ||
      `https://drive.google.com/file/d/${driveFileId}/view`
    const resolvedClinicId = String(body.clinicId || clinicId || '').trim()

    await db.diagnosticAids.update(aidId, {
      driveFileId,
      webViewLink,
      storageBackend: 'google_drive',
      driveUploadStatus: 'uploaded',
      driveUploadError: null,
      clinicId: resolvedClinicId || entry.clinicId,
      pendingSync: true,
    })

    const updated = (await db.diagnosticAids.get(aidId)) ?? {
      ...entry,
      driveFileId,
      webViewLink,
      storageBackend: 'google_drive' as const,
      driveUploadStatus: 'uploaded' as const,
    }

    await enqueueDiagnosticAidForSync(updated, {
      driveFileId,
      binarySynced: true,
      mimeType,
    })

    emit('done', 'Guardado en Google Drive.')
    return updated
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'No se pudo subir el archivo a Google Drive.'
    const failed = await markUploadError(aidId, message)
    emit('error', message)
    return failed ?? { ...entry, driveUploadStatus: 'error', driveUploadError: message }
  }
}
