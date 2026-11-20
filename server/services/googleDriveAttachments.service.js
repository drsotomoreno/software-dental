/**
 * Subida/bajada de adjuntos clínicos a Google Drive (scope drive.file).
 * Ruta: {root}/pacientes/{patientSyncId}/ayudas/{fileName}
 * Caché en memoria de IDs de carpeta para no agotar cuota en lotes.
 * Preferir filePath + createReadStream (t3.micro) frente a Buffer en RAM.
 *
 * Nota: googleapis + fs.ReadStream directo puede subir 0 bytes o cortar el
 * body si el access_token se refresca a mitad de la petición. Por eso:
 * 1) refrescar token ANTES de abrir el stream
 * 2) pipear por PassThrough
 */
import { createReadStream } from 'node:fs'
import { PassThrough, Readable } from 'node:stream'
import {
  getAuthorizedDriveClient,
  isGoogleDriveAuthFailure,
  isGoogleDriveReconnectRequiredError,
  rethrowAsGoogleDriveReconnectIfAuthFailure,
} from './googleDriveOAuth.service.js'

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

/**
 * Si el aidId ya está en Drive, la segunda subida no llama a files.create.
 * Un archivo de 0 bytes se actualiza; uno con bytes se reutiliza.
 */
export function selectExistingAidUpload(files) {
  const list = (Array.isArray(files) ? files : []).filter((file) => file && file.id)
  const ready = list
    .filter((file) => Number(file.size) > 0)
    .sort((a, b) => Number(b.size) - Number(a.size))
  if (ready[0]) return { action: 'reuse', file: ready[0] }
  if (list[0]) return { action: 'update', file: list[0] }
  return { action: 'create', file: null }
}

export async function findFileByAidId(drive, aidId) {
  const id = String(aidId || '').trim()
  if (!id || typeof drive?.files?.list !== 'function') {
    return { action: 'create', file: null }
  }
  const q = [
    `appProperties has { key='aidId' and value='${escapeDriveQueryValue(id)}' }`,
    'trashed = false',
  ].join(' and ')
  const res = await drive.files.list({
    q,
    spaces: 'drive',
    fields: 'files(id, name, size, webViewLink)',
    pageSize: 10,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  })
  const files = Array.isArray(res.data?.files) ? res.data.files : []
  return selectExistingAidUpload(files)
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
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
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
      supportsAllDrives: true,
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

/** Carpeta dedicada bajo la raíz de la clínica (p. ej. Firmas_Clinicas). */
async function ensureFolderPath(drive, rootFolderId, segments) {
  let parent = rootFolderId
  for (const segment of segments) {
    const name = safeFileName(segment, 'carpeta')
    parent = await getOrCreateChildFolder(drive, rootFolderId, parent, name)
  }
  return parent
}

async function resolveClinicDrive(canonicalClinicId, candidateIds = []) {
  let storageKey = String(canonicalClinicId || '').trim()
  try {
    const client = await getAuthorizedDriveClient(canonicalClinicId, candidateIds)
    storageKey = String(client?.clinicId || storageKey).trim()
    // Fuerza refresh ANTES de abrir streams de archivo (evita reintento que
    // consume el ReadStream y deja el archivo en Drive con 0 bytes).
    if (client?.auth && typeof client.auth.getAccessToken === 'function') {
      try {
        await client.auth.getAccessToken()
      } catch (tokenError) {
        await rethrowAsGoogleDriveReconnectIfAuthFailure(storageKey, tokenError)
      }
    }
    return client
  } catch (error) {
    if (isGoogleDriveReconnectRequiredError(error)) throw error
    if (isGoogleDriveAuthFailure(error)) {
      await rethrowAsGoogleDriveReconnectIfAuthFailure(storageKey, error)
    }
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

/** fs.ReadStream → PassThrough (googleapis no siempre consume bien el FD crudo). */
function asUploadBody(source) {
  if (!source) return source
  if (Buffer.isBuffer(source)) return Readable.from(source)
  if (typeof source.pipe === 'function') {
    const pass = new PassThrough()
    source.on('error', (err) => {
      try {
        pass.destroy(err)
      } catch {
        // ignore
      }
    })
    source.pipe(pass)
    return pass
  }
  return source
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
  /** Factory opcional: () => fs.createReadStream(req.file.path) */
  createReadStream: createReadStreamFn,
  byteLength: knownByteLength,
  driveFileId: existingFileId,
  appProperties = {},
  /** Si viene, la subida no usa pacientes/{id}/ayudas. Ej. ['Firmas_Clinicas']. */
  folderSegments = null,
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

  const resolved = await resolveClinicDrive(clinicId, clinicIdCandidates)
  const { drive, rootFolderId } = resolved
  const storageKey = String(resolved?.clinicId || clinicId || '').trim()
  if (!rootFolderId) {
    throw new GoogleDriveRequiredError(
      'La clínica no tiene carpeta raíz en Google Drive. Vuelva a conectar la integración.',
    )
  }

  const openFileStream = () => {
    const raw =
      typeof createReadStreamFn === 'function' ? createReadStreamFn() : createReadStream(path)
    return asUploadBody(raw)
  }

  const name = safeFileName(fileName)

  const props = {}
  for (const [key, value] of Object.entries(appProperties || {})) {
    const k = String(key || '').trim().slice(0, 64)
    const v = String(value ?? '').trim().slice(0, 120)
    if (k && v) props[k] = v
  }

  let fileIdToUpdate = String(existingFileId || '').trim()
  if (!fileIdToUpdate && props.aidId) {
    try {
      const decision = await findFileByAidId(drive, props.aidId)
      if (decision.action === 'reuse' && decision.file?.id) {
        return {
          driveFileId: String(decision.file.id),
          webViewLink:
            String(decision.file.webViewLink || '').trim() ||
            `https://drive.google.com/file/d/${decision.file.id}/view`,
          byteLength: Number(decision.file.size) > 0 ? Number(decision.file.size) : byteLength,
          storageBackend: 'google_drive',
        }
      }
      if (decision.action === 'update' && decision.file?.id) {
        fileIdToUpdate = String(decision.file.id)
      }
    } catch (error) {
      if (isGoogleDriveAuthFailure(error) || isGoogleDriveReconnectRequiredError(error)) {
        await rethrowAsGoogleDriveReconnectIfAuthFailure(storageKey, error)
      }
      console.warn(
        '[google-drive] búsqueda por aidId omitida:',
        error instanceof Error ? error.message : error,
      )
    }
  }

  let parentId = ''
  const resolveParentId = async () => {
    if (parentId) return parentId
    parentId =
      Array.isArray(folderSegments) && folderSegments.length
        ? await ensureFolderPath(drive, rootFolderId, folderSegments)
        : await ensurePatientFolder(drive, rootFolderId, patientSyncId)
    return parentId
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

  function buildMedia() {
    const body = hasPath ? openFileStream() : asUploadBody(buffer)
    return {
      mimeType: String(mimeType || 'application/octet-stream'),
      body,
    }
  }

  /** @type {import('node:stream').Readable | null} */
  let lastBody = null
  try {
    if (fileIdToUpdate) {
      try {
        const media = buildMedia()
        lastBody = media.body
        const updated = await drive.files.update({
          fileId: fileIdToUpdate,
          requestBody: {
            name,
            appProperties: Object.keys(props).length ? props : undefined,
          },
          media,
          fields: 'id, size, webViewLink',
          supportsAllDrives: true,
        })
        const id = updated.data?.id || fileIdToUpdate
        return resultPayload(id, updated.data?.webViewLink, updated.data?.size)
      } catch (error) {
        if (isGoogleDriveAuthFailure(error) || isGoogleDriveReconnectRequiredError(error)) {
          await rethrowAsGoogleDriveReconnectIfAuthFailure(storageKey, error)
        }
        console.warn(
          '[google-drive] update falló; se crea archivo nuevo:',
          error instanceof Error ? error.message : error,
        )
        try {
          lastBody?.destroy?.()
        } catch {
          // ignore
        }
        lastBody = null
      }
    }

    const media = buildMedia()
    lastBody = media.body
    const created = await drive.files.create({
      requestBody: {
        name,
        parents: [await resolveParentId()],
        appProperties: Object.keys(props).length ? props : undefined,
      },
      media,
      fields: 'id, name, size, webViewLink',
      supportsAllDrives: true,
    })
    const driveFileId = created.data?.id
    if (!driveFileId) {
      const err = new Error('Google Drive no devolvió fileId tras la subida.')
      err.code = 'DRIVE_UPLOAD_FAILED'
      throw err
    }
    const uploadedSize = Number(created.data?.size) || 0
    if (byteLength > 0 && uploadedSize === 0) {
      const err = new Error(
        'Google Drive creó el archivo vacío (0 bytes). Reintente la subida; si persiste, reconecte Drive en Perfil.',
      )
      err.code = 'DRIVE_UPLOAD_EMPTY'
      throw err
    }
    return resultPayload(driveFileId, created.data?.webViewLink, created.data?.size)
  } catch (error) {
    if (isGoogleDriveReconnectRequiredError(error)) throw error
    if (isGoogleDriveAuthFailure(error)) {
      await rethrowAsGoogleDriveReconnectIfAuthFailure(storageKey, error)
    }
    throw error
  } finally {
    try {
      lastBody?.destroy?.()
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

  const resolved = await resolveClinicDrive(clinicId, clinicIdCandidates)
  const { drive } = resolved
  const storageKey = String(resolved?.clinicId || clinicId || '').trim()
  try {
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
  } catch (error) {
    if (isGoogleDriveReconnectRequiredError(error)) throw error
    if (isGoogleDriveAuthFailure(error)) {
      await rethrowAsGoogleDriveReconnectIfAuthFailure(storageKey, error)
    }
    throw error
  }
}
