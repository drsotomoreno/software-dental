/**
 * Persistencia de adjuntos clínicos — solo Google Drive (sin disco local).
 * El snapshot JSON guarda metadatos (`driveFileId`, `storageBackend`); los bytes viven en Drive.
 */
import {
  downloadClinicAttachmentFromDrive,
  GoogleDriveRequiredError,
  isGoogleDriveRequiredError,
  uploadClinicAttachmentToDrive,
} from './googleDriveAttachments.service.js'
import { getClinicGoogleDriveStatus } from './clinicGoogleDriveStore.js'

export { GoogleDriveRequiredError, isGoogleDriveRequiredError }

export function bufferToBase64(buffer) {
  if (!buffer) return ''
  return Buffer.from(buffer).toString('base64')
}

export function base64ToBuffer(base64) {
  if (!base64) return null
  try {
    const buf = Buffer.from(String(base64), 'base64')
    return buf.length > 0 ? buf : null
  } catch {
    return null
  }
}

/**
 * Bloqueo estricto: sin Drive conectado no hay subida/descarga de binarios.
 * @throws {GoogleDriveRequiredError}
 */
export async function assertClinicDriveConnected(clinicId) {
  const id = String(clinicId || '').trim()
  if (!id) {
    throw new GoogleDriveRequiredError('clinicId canónico vacío; no se pueden persistir adjuntos.')
  }
  const status = await getClinicGoogleDriveStatus(id)
  if (!status.connected || !status.rootFolderId) {
    throw new GoogleDriveRequiredError(
      'Google Drive no está conectado para esta clínica. El dueño o administrador debe vincular el Gmail antes de sincronizar radiografías o fotos.',
    )
  }
  return status
}

/**
 * Sube bytes a Drive bajo pacientes/{patientSyncId}/ayudas/.
 * Reemplaza el antiguo writeFile en server/data/clinic-attachments/.
 */
export async function writeAttachmentBytes(clinicId, _attachmentId, buffer, options = {}) {
  await assertClinicDriveConnected(clinicId)
  return uploadClinicAttachmentToDrive({
    clinicId,
    patientSyncId: options.patientSyncId || options.patientId || 'sin-paciente',
    fileName: options.fileName || _attachmentId || 'archivo',
    mimeType: options.mimeType || 'application/octet-stream',
    buffer,
    driveFileId: options.driveFileId || null,
    appProperties: {
      clinicId: String(clinicId),
      aidId: String(options.aidId || _attachmentId || ''),
      fileHash: String(options.fileHash || ''),
      syncId: String(options.syncId || ''),
    },
  })
}

/**
 * Descarga bytes desde Drive por driveFileId.
 * La firma legacy (clinicId, attachmentId) ya no lee disco; use options.driveFileId.
 */
export async function readAttachmentBytes(clinicId, _attachmentId, options = {}) {
  const driveFileId = String(options.driveFileId || _attachmentId || '').trim()
  if (!driveFileId) return null
  try {
    await assertClinicDriveConnected(clinicId)
    return await downloadClinicAttachmentFromDrive({ clinicId, driveFileId })
  } catch (error) {
    if (isGoogleDriveRequiredError(error)) throw error
    console.warn(
      '[attachments] No se pudo descargar desde Drive:',
      error instanceof Error ? error.message : error,
    )
    return null
  }
}
