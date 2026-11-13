/**
 * Subida/bajada de adjuntos clínicos a Google Drive (scope drive.file).
 * Ruta: {root}/pacientes/{patientSyncId}/ayudas/{fileName}
 * Caché en memoria de IDs de carpeta para no agotar cuota en lotes.
 * Preferir filePath + createReadStream (t3.micro) frente a Buffer en RAM.
 */
import { createReadStream } from 'node:fs'
import { Readable } from 'node:stream'
import { getAuthorizedDriveClient } from './googleDriveOAuth.service.js'

const FOLDER_MIME = 'application/vnd.google-apps.folder'
const CACHE_TTL_MS = 30 * 60 * 1000
const MAX_CACHE_ENTRIES = 2500

/** @type {Map<string, { id: string, expiresAt: number }>} */
const folderIdCache = new Map()

export class GoogleDriveRequiredError extends Error {
  constructor(
    message = 'La clínica debe conectar Google Drive antes de subir o descargar adjuntos.',
  ) {
    super(message)
    this.name = 'GoogleDriveRequiredError'
    this.code = 'google_drive_required'
    this.status = 428
  }
}

export function isGoogleDriveRequiredError(error) {
  return (
    Boolean(error) &&
    (error instanceof GoogleDriveRequiredError ||
      error.code === 'google_drive_required' ||
      error.code === 'DRIVE_NOT_CONNECTED')
  )
}

function cacheKey(rootFolderId, parentId, name) {
  return `${rootFolderId}::${parentId}::${name}`
}

function cacheGet(key) {
  const hit = folderIdCache.get(key)
  if (!hit) return null
  if (Date.now() > hit.expiresAt) {
    folderIdCache.delete(key)
    return null
  }
  // LRU suave: reinsertar al final
  folderIdCache.delete(key)
  folderIdCache.set(key, hit)
  return hit.id
}

function cacheSet(key, id) {
  if (folderIdCache.size >= MAX_CACHE_ENTRIES) {
    const oldest = folderIdCache.keys().next().value
    if (oldest) folderIdCache.delete(oldest)
  }
  folderIdCache.set(key, { id: String(id), expiresAt: Date.now() + CACHE_TTL_MS })
}

/** Solo tests / mantenimiento. */
export function clearDriveFolderCache() {
  folderIdCache.clear()
}

function escapeDriveQueryValue(value) {
  return String(value || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

function safeFileName(value, fallback = 'archivo') {
  const cleaned = String(value || '')
    .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
  return (cleaned || fallback).slice(0, 180)
}

function safePatientSegment(patientSyncId) {
  const raw = String(patientSyncId || '').trim()
  if (!raw) return 'sin-paciente'
  return raw.replace(/[<>:"/\\|?*\u0000-\u001f]+/g, '_').slice(0, 120) || 'sin-paciente'
}

async function findChildFolder(drive, parentId, name) {
  const q = [
    `name = '${escapeDriveQueryValue(name)}'`,
    `mimeType = '${FOLDER_MIME}'`,
    `'${escapeDriveQueryValue(parentId)}' in parents`,
    'trashed = false',
  ].join(' and ')
  const res = await drive.files.list({
    q,
    spaces: 'drive',
    fields: 'files(id, name)',
    pageSize: 3,
  })
  const files = Array.isArray(res.data?.files) ? res.data.files : []
  return files[0]?.id || null
}

async function getOrCreateChildFolder(drive, rootFolderId, parentId, name) {
  const key = cacheKey(rootFolderId, parentId, name)
  const cached = cacheGet(key)
  if (cached) return cached

  let id = await findChildFolder(drive, parentId, name)
  if (!id) {
    const created = await drive.files.create({
      requestBody: {
        name,
        mimeType: FOLDER_MIME,
        parents: [parentId],
      },
      fields: 'id, name',
    })
    id = created.data?.id || null
  }
  if (!id) {
    const err = new Error(`No se pudo resolver la carpeta Drive "${name}".`)
    err.code = 'DRIVE_FOLDER_RESOLVE_FAILED'
    throw err
  }
  cacheSet(key, id)
  return id
}

/**
 * Garantiza pacientes/{patientSyncId}/ayudas bajo la carpeta raíz de la app.
 * @returns {Promise<string>} ID de la carpeta `ayudas`
 */
export async function ensurePatientFolder(driveClient, rootFolderId, patientSyncId) {
  const drive = driveClient?.files ? driveClient : driveClient?.drive
  if (!drive || !rootFolderId) {
    const err = new Error('Cliente Drive o rootFolderId inválidos.')
    err.code = 'DRIVE_CLIENT_INVALID'
    throw err
  }
  const patientSeg = safePatientSegment(patientSyncId)
  const pacientesId = await getOrCreateChildFolder(drive, rootFolderId, rootFolderId, 'pacientes')
  const patientId = await getOrCreateChildFolder(drive, rootFolderId, pacientesId, patientSeg)
  const ayudasId = await getOrCreateChildFolder(drive, rootFolderId, patientId, 'ayudas')
  return ayudasId
}

async function resolveClinicDrive(canonicalClinicId, candidateIds = []) {
  try {
    return await getAuthorizedDriveClient(canonicalClinicId, candidateIds)
  } catch (error) {
    if (isGoogleDriveRequiredError(error)) {
      throw new GoogleDriveRequiredError(
        error instanceof Error
          ? error.message
          : 'La clínica debe conectar Google Drive antes de subir o descargar adjuntos.',
      )
    }
    throw error
  }
}

/**
 * Sube a Drive por stream (filePath) o buffer pequeño.
 * Preferir `filePath` + createReadStream para STL/PLY grandes (≤5 MB RAM).
 * @returns {{ driveFileId: string, webViewLink: string, byteLength: number, storageBackend: 'google_drive' }}
 */
export async function uploadClinicAttachmentToDrive({
  clinicId,
  clinicIdCandidates = [],
  patientSyncId,
  fileName,
  mimeType,
  buffer,
  filePath,
  byteLength: knownByteLength,
  driveFileId: existingFileId,
  appProperties = {},
}) {
  const path = String(filePath || '').trim()
  const hasPath = Boolean(path)
  const hasBuffer = Boolean(buffer && Buffer.isBuffer(buffer) && buffer.length > 0)
  if (!hasPath && !hasBuffer) {
    const err = new Error('Adjunto vacío (ni filePath ni buffer).')
    err.code = 'EMPTY_ATTACHMENT_BUFFER'
    throw err
  }

  const byteLength = hasPath
    ? Number(knownByteLength) > 0
      ? Number(knownByteLength)
      : 0
    : buffer.length

  const { drive, rootFolderId } = await resolveClinicDrive(clinicId, clinicIdCandidates)
  if (!rootFolderId) {
    throw new GoogleDriveRequiredError(
      'La clínica no tiene carpeta raíz en Google Drive. Vuelva a conectar la integración.',
    )
  }

  const parentId = await ensurePatientFolder(drive, rootFolderId, patientSyncId)
  const name = safeFileName(fileName)
  const mediaBody = hasPath ? createReadStream(path) : Readable.from(buffer)
  const media = {
    mimeType: String(mimeType || 'application/octet-stream'),
    body: mediaBody,
  }

  const props = {}
  for (const [key, value] of Object.entries(appProperties || {})) {
    const k = String(key || '').trim().slice(0, 64)
    const v = String(value ?? '').trim().slice(0, 120)
    if (k && v) props[k] = v
  }

  function resultPayload(id, webViewLink, sizeHint) {
    const link =
      String(webViewLink || '').trim() ||
      (id ? `https://drive.google.com/file/d/${id}/view` : '')
    const size = Number(sizeHint) > 0 ? Number(sizeHint) : byteLength
    return {
      driveFileId: id,
      webViewLink: link,
      byteLength: size,
      storageBackend: 'google_drive',
    }
  }

  try {
    if (existingFileId) {
      try {
        const updated = await drive.files.update({
          fileId: String(existingFileId),
          requestBody: {
            name,
            appProperties: Object.keys(props).length ? props : undefined,
          },
          media,
          fields: 'id, size, webViewLink',
        })
        const id = updated.data?.id || String(existingFileId)
        return resultPayload(id, updated.data?.webViewLink, updated.data?.size)
      } catch (error) {
        console.warn(
          '[google-drive] update falló; se crea archivo nuevo:',
          error instanceof Error ? error.message : error,
        )
        // Reabrir stream si el update consumió el anterior.
        if (hasPath) {
          media.body = createReadStream(path)
        } else {
          media.body = Readable.from(buffer)
        }
      }
    }

    const created = await drive.files.create({
      requestBody: {
        name,
        parents: [parentId],
        appProperties: Object.keys(props).length ? props : undefined,
      },
      media,
      fields: 'id, name, size, webViewLink',
    })
    const driveFileId = created.data?.id
    if (!driveFileId) {
      const err = new Error('Google Drive no devolvió fileId tras la subida.')
      err.code = 'DRIVE_UPLOAD_FAILED'
      throw err
    }
    return resultPayload(driveFileId, created.data?.webViewLink, created.data?.size)
  } finally {
    try {
      if (mediaBody && typeof mediaBody.destroy === 'function') mediaBody.destroy()
    } catch {
      // ignore
    }
  }
}

/**
 * Descarga bytes de Drive por fileId.
 * @returns {Promise<Buffer|null>}
 */
export async function downloadClinicAttachmentFromDrive({
  clinicId,
  clinicIdCandidates = [],
  driveFileId,
}) {
  const fileId = String(driveFileId || '').trim()
  if (!fileId) return null

  const { drive } = await resolveClinicDrive(clinicId, clinicIdCandidates)
  const res = await drive.files.get(
    { fileId, alt: 'media' },
    { responseType: 'arraybuffer' },
  )

  if (res.data == null) return null
  if (Buffer.isBuffer(res.data)) return res.data
  if (res.data instanceof ArrayBuffer) return Buffer.from(res.data)
  if (typeof res.data === 'string') return Buffer.from(res.data, 'binary')
  // Algunos clientes entregan Uint8Array
  if (ArrayBuffer.isView(res.data)) {
    return Buffer.from(res.data.buffer, res.data.byteOffset, res.data.byteLength)
  }
  return null
}
