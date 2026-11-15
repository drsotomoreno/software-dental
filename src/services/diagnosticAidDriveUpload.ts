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

const DRIVE_UPLOAD_SYNC_PAUSE = 'drive-upload'

export const DIAGNOSTIC_AID_MAX_UPLOAD_BYTES = 100 * 1024 * 1024

export type DriveUploadProgress = {
  aidId: string
  phase: 'checking' | 'uploading' | 'done' | 'error' | 'skipped'
  message: string
}

function resolveUploadClinicId(entry: DiagnosticAid): string {
  return String(entry.clinicId || resolveActiveDriveClinicId() || '').trim()
}

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === 'AbortError') ||
    (error instanceof Error && /aborted|AbortError/i.test(error.message))
  )
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
 * POST /upload con un reintento ante 502/503/504 o fallo de red
 * (PM2 reiniciando tras OOM / Nginx Bad Gateway).
 */
async function postDriveUploadWithRetry(
  postOnce: () => Promise<Response>,
  emit: (phase: DriveUploadProgress['phase'], message: string) => void,
): Promise<Response> {
  try {
    const first = await postOnce()
    if (first.status === 502 || first.status === 503 || first.status === 504) {
      emit('uploading', 'Servidor ocupado; reintentando subida…')
      await new Promise((r) => window.setTimeout(r, 2_500))
      return postOnce()
    }
    return first
  } catch (error) {
    if (isAbortError(error)) throw error
    emit('uploading', 'Red inestable; reintentando subida…')
    await new Promise((r) => window.setTimeout(r, 2_500))
    return postOnce()
  }
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

  await db.diagnosticAids.update(aidId, {
    driveUploadStatus: 'uploading',
    driveUploadError: null,
  })

  const auth = getStoredApiAuth()
  if (!auth?.token) {
    const message =
      'Sesión inválida o expirada. Vuelva a iniciar sesión para subir a Google Drive.'
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

  // Pausar sync clínico: enqueue + poll cada N s mataban Node (163MB JSON) durante el upload.
  const { pauseClinicalSync, resumeClinicalSync, scheduleClinicalSync } = await import(
    '@/services/clinicalSyncService'
  )
  pauseClinicalSync(DRIVE_UPLOAD_SYNC_PAUSE)

  emit('uploading', 'Subiendo a Google Drive…')
  const clinicId = resolveUploadClinicId(entry)

  try {
    const mimeType = blobRecord.mimeType || mimeTypeForDiagnosticFile(entry.fileName)
    const bytes = blobRecord.data.byteLength || 0
    const timeoutMs = Math.min(
      180_000,
      Math.max(90_000, 45_000 + Math.ceil(bytes / (256 * 1024)) * 1_000),
    )

    const postOnce = async (): Promise<Response> => {
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
      const timer = window.setTimeout(() => controller.abort(), timeoutMs)
      try {
        return await fetch(
          `/api/integrations/google-drive/upload${driveClinicQuery(clinicId)}`,
          {
            method: 'POST',
            headers: driveIdentityHeaders(clinicId),
            body: form,
            signal: controller.signal,
          },
        )
      } finally {
        window.clearTimeout(timer)
      }
    }

    let response: Response
    try {
      response = await postDriveUploadWithRetry(postOnce, emit)
    } catch (error) {
      const message = isAbortError(error)
        ? `La subida a Google Drive superó ${Math.round(timeoutMs / 1000)} s. Reintente con «Subir a Drive».`
        : error instanceof Error
          ? error.message
          : 'No se pudo subir el archivo a Google Drive.'
      const failed = await markUploadError(aidId, message)
      emit('error', message)
      return failed ?? { ...entry, driveUploadStatus: 'error', driveUploadError: message }
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
    // NO sobrescribir clinicId con el storageKey de Drive (p. ej. clinic:email):
    // purgeForeignClinicRecords lo trataría como ajeno y borraría el adjunto de Dexie
    // → lista vacía pese a "Guardado en Google Drive".
    const sessionClinicId = String(entry.clinicId || clinicId || resolveActiveDriveClinicId() || '').trim()

    await db.diagnosticAids.update(aidId, {
      driveFileId,
      webViewLink,
      storageBackend: 'google_drive',
      driveUploadStatus: 'uploaded',
      driveUploadError: null,
      ...(sessionClinicId ? { clinicId: sessionClinicId } : {}),
      pendingSync: true,
    })

    const updated = (await db.diagnosticAids.get(aidId)) ?? {
      ...entry,
      driveFileId,
      webViewLink,
      storageBackend: 'google_drive' as const,
      driveUploadStatus: 'uploaded' as const,
      clinicId: sessionClinicId || entry.clinicId,
    }

    await enqueueDiagnosticAidForSync(updated, {
      driveFileId,
      binarySynced: true,
      mimeType,
      webViewLink,
    })

    emit('done', 'Guardado en Google Drive.')
    return updated
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'No se pudo subir el archivo a Google Drive.'
    const failed = await markUploadError(aidId, message)
    emit('error', message)
    return failed ?? { ...entry, driveUploadStatus: 'error', driveUploadError: message }
  } finally {
    resumeClinicalSync(DRIVE_UPLOAD_SYNC_PAUSE)
    // Metadatos mucho después del upload: no competir con Drive ni reinicios PM2.
    scheduleClinicalSync(45_000)
  }
}
