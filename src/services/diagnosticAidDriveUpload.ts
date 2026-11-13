import { db } from '@/db/database'
import { getStoredApiAuth } from '@/services/apiAuthService'
import { getDiagnosticAidBlobByAidId } from '@/services/diagnosticAidBlobStore'
import { getCurrentClinicId } from '@/services/clinicalSyncState'
import {
  isGoogleDriveRequiredResponse,
  notifyGoogleDriveRequired,
} from '@/services/globalToast'
import { enqueueDiagnosticAidForSync } from '@/services/syncQueueService'
import type { DiagnosticAid } from '@/types/diagnosticAid'
import { arrayBufferToBase64 } from '@/utils/base64Binary'
import { mimeTypeForDiagnosticFile } from '@/utils/diagnosticAidWebClassification'

export type DriveUploadProgress = {
  aidId: string
  phase: 'checking' | 'uploading' | 'done' | 'error' | 'skipped'
  message: string
}

type DriveStatusPayload = {
  connected?: boolean
  status?: string
  clinicId?: string | null
}

function identityHeaders() {
  const auth = getStoredApiAuth()
  return {
    ...(auth?.token ? { Authorization: `Bearer ${auth.token}` } : {}),
    ...(auth?.user?.email ? { 'X-Client-Email': String(auth.user.email) } : {}),
    ...(auth?.user?.id ? { 'X-Client-User-Id': String(auth.user.id) } : {}),
    ...(auth?.user?.documentNumber
      ? { 'X-Client-Document': String(auth.user.documentNumber) }
      : {}),
  }
}

function clinicQuery(): string {
  const auth = getStoredApiAuth()
  const clinicId = String(
    getCurrentClinicId() || auth?.user?.clinicId || auth?.user?.id || '',
  ).trim()
  return clinicId ? `?clinicId=${encodeURIComponent(clinicId)}` : ''
}

async function readDriveConnected(): Promise<boolean> {
  const auth = getStoredApiAuth()
  if (!auth?.token) return false
  try {
    const response = await fetch(`/api/integrations/google-drive/status${clinicQuery()}`, {
      headers: {
        Accept: 'application/json',
        ...identityHeaders(),
      },
    })
    const body = (await response.json().catch(() => ({}))) as DriveStatusPayload
    if (!response.ok) return false
    return Boolean(body.connected) || body.status === 'connected'
  } catch {
    return false
  }
}

async function blobBase64ForAid(aidId: string): Promise<string | null> {
  const record = await getDiagnosticAidBlobByAidId(aidId)
  if (!record?.data) return null
  return arrayBufferToBase64(record.data)
}

export async function uploadDiagnosticAidToGoogleDrive(
  entry: DiagnosticAid,
  onProgress?: (progress: DriveUploadProgress) => void,
): Promise<DiagnosticAid> {
  const aidId = entry.id
  const emit = (phase: DriveUploadProgress['phase'], message: string) => {
    onProgress?.({ aidId, phase, message })
  }

  if (entry.driveFileId && entry.webViewLink) {
    emit('done', 'Ya estaba en Google Drive.')
    return entry
  }

  emit('checking', 'Verificando Google Drive…')
  await db.diagnosticAids.update(aidId, {
    driveUploadStatus: 'uploading',
    driveUploadError: null,
  })

  const connected = await readDriveConnected()
  if (!connected) {
    await db.diagnosticAids.update(aidId, {
      driveUploadStatus: 'local_only',
      driveUploadError: null,
      storageBackend: 'indexeddb',
    })
    emit('skipped', 'Google Drive no está conectado; queda en caché local.')
    const local = await db.diagnosticAids.get(aidId)
    return local ?? entry
  }

  const dataBase64 = await blobBase64ForAid(aidId)
  if (!dataBase64) {
    const message = 'No hay copia local del archivo para subir a Google Drive.'
    await db.diagnosticAids.update(aidId, {
      driveUploadStatus: 'error',
      driveUploadError: message,
    })
    emit('error', message)
    const failed = await db.diagnosticAids.get(aidId)
    return failed ?? entry
  }

  emit('uploading', 'Subiendo a Google Drive…')
  const auth = getStoredApiAuth()
  const clinicId = String(
    entry.clinicId || getCurrentClinicId() || auth?.user?.clinicId || auth?.user?.id || '',
  ).trim()

  try {
    const response = await fetch(`/api/integrations/google-drive/upload${clinicQuery()}`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...identityHeaders(),
      },
      body: JSON.stringify({
        aidId,
        fileName: entry.fileName,
        mimeType: mimeTypeForDiagnosticFile(entry.fileName),
        dataBase64,
        patientSyncId: entry.patientSyncId || entry.patientId,
        clinicId: clinicId || undefined,
        driveFileId: entry.driveFileId || undefined,
      }),
    })
    const body = await response.json().catch(() => ({}))

    if (isGoogleDriveRequiredResponse(response, body)) {
      notifyGoogleDriveRequired()
      const message =
        typeof body?.error === 'string'
          ? body.error
          : 'La clínica debe conectar Google Drive antes de subir adjuntos.'
      await db.diagnosticAids.update(aidId, {
        driveUploadStatus: 'local_only',
        driveUploadError: message,
        storageBackend: 'indexeddb',
      })
      emit('error', message)
      const local = await db.diagnosticAids.get(aidId)
      return local ?? entry
    }

    if (!response.ok || !body?.driveFileId) {
      const message =
        typeof body?.error === 'string'
          ? body.error
          : `Error al subir a Google Drive (HTTP ${response.status}).`
      await db.diagnosticAids.update(aidId, {
        driveUploadStatus: 'error',
        driveUploadError: message,
      })
      emit('error', message)
      const failed = await db.diagnosticAids.get(aidId)
      return failed ?? entry
    }

    const driveFileId = String(body.driveFileId)
    const webViewLink =
      String(body.webViewLink || '').trim() ||
      `https://drive.google.com/file/d/${driveFileId}/view`

    await db.diagnosticAids.update(aidId, {
      driveFileId,
      webViewLink,
      storageBackend: 'google_drive',
      driveUploadStatus: 'uploaded',
      driveUploadError: null,
      clinicId: clinicId || entry.clinicId,
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
      mimeType: mimeTypeForDiagnosticFile(entry.fileName),
    })

    emit('done', 'Guardado en Google Drive.')
    return updated
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'No se pudo subir el archivo a Google Drive.'
    await db.diagnosticAids.update(aidId, {
      driveUploadStatus: 'error',
      driveUploadError: message,
    })
    emit('error', message)
    const failed = await db.diagnosticAids.get(aidId)
    return failed ?? entry
  }
}
