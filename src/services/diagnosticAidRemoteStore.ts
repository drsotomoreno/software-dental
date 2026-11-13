import { db } from '@/db/database'
import { getStoredApiAuth } from '@/services/apiAuthService'
import {
  getDiagnosticAidBlobByAidId,
  saveDiagnosticAidBlobFromBuffer,
} from '@/services/diagnosticAidBlobStore'
import {
  driveClinicQuery,
  driveIdentityHeaders,
  resolveActiveDriveClinicId,
} from '@/services/googleDriveClinicContext'
import {
  isGoogleDriveRequiredResponse,
  notifyGoogleDriveRequired,
} from '@/services/globalToast'
import type { DiagnosticAid, DiagnosticAidBlobRecord } from '@/types/diagnosticAid'
import { base64ToArrayBuffer } from '@/utils/base64Binary'
import { mimeTypeForDiagnosticFile } from '@/utils/diagnosticAidWebClassification'

const FETCH_TIMEOUT_MS = 45_000

export const DIAGNOSTIC_AID_UNAVAILABLE_MESSAGE =
  'Archivo no disponible localmente ni en Google Drive; elimínelo y vuelva a adjuntarlo'

function identityHeaders() {
  return driveIdentityHeaders(resolveActiveDriveClinicId())
}

function clinicQuery(): string {
  return driveClinicQuery(resolveActiveDriveClinicId())
}

function payloadOf(record: unknown): Record<string, unknown> {
  if (!record || typeof record !== 'object') return {}
  const value = record as { payload?: Record<string, unknown> }
  if (value.payload && typeof value.payload === 'object') return value.payload
  return record as Record<string, unknown>
}

async function fetchWithTimeout(
  input: string,
  init: RequestInit = {},
  timeoutMs = FETCH_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(input, { ...init, signal: controller.signal })
  } finally {
    window.clearTimeout(timer)
  }
}

async function persistRemoteBlob(
  entry: DiagnosticAid,
  payload: Record<string, unknown>,
): Promise<DiagnosticAidBlobRecord | null> {
  const dataBase64 = String(payload.dataBase64 || '')
  if (!dataBase64) return null
  const fileName = String(payload.fileName || entry.fileName)
  const blobId = await saveDiagnosticAidBlobFromBuffer(entry.id, {
    fileName,
    mimeType: String(payload.mimeType || mimeTypeForDiagnosticFile(fileName)),
    data: base64ToArrayBuffer(dataBase64),
    id: typeof payload.blobId === 'string' ? payload.blobId : undefined,
  })
  await db.diagnosticAids.update(entry.id, { blobId })
  entry.blobId = blobId
  return (await getDiagnosticAidBlobByAidId(entry.id)) ?? null
}

async function persistArrayBuffer(
  entry: DiagnosticAid,
  data: ArrayBuffer,
  mimeType?: string,
): Promise<DiagnosticAidBlobRecord | null> {
  if (!data || data.byteLength === 0) return null
  const blobId = await saveDiagnosticAidBlobFromBuffer(entry.id, {
    fileName: entry.fileName,
    mimeType: mimeType || mimeTypeForDiagnosticFile(entry.fileName),
    data,
  })
  await db.diagnosticAids.update(entry.id, {
    blobId,
    storageBackend: entry.driveFileId ? 'google_drive' : entry.storageBackend,
  })
  entry.blobId = blobId
  return (await getDiagnosticAidBlobByAidId(entry.id)) ?? null
}

/** Descarga bytes desde el proxy Drive del backend. */
export async function fetchDiagnosticAidFromGoogleDrive(
  entry: Pick<DiagnosticAid, 'driveFileId' | 'fileName' | 'id'>,
): Promise<ArrayBuffer | null> {
  const driveFileId = String(entry.driveFileId || '').trim()
  if (!driveFileId) return null
  const auth = getStoredApiAuth()
  if (!auth?.token) return null

  const mimeType = encodeURIComponent(mimeTypeForDiagnosticFile(entry.fileName))
  const fileName = encodeURIComponent(entry.fileName || 'archivo.bin')
  const sep = clinicQuery().includes('?') ? '&' : '?'
  const url = `/api/integrations/google-drive/file/${encodeURIComponent(driveFileId)}${clinicQuery()}${sep}mimeType=${mimeType}&fileName=${fileName}`

  try {
    const response = await fetchWithTimeout(url, {
      headers: {
        Accept: 'application/octet-stream, application/json',
        ...identityHeaders(),
      },
    })
    if (response.status === 404 || response.status === 401) return null
    const contentType = response.headers.get('content-type') || ''
    if (contentType.includes('application/json')) {
      const body = await response.json().catch(() => ({}))
      if (isGoogleDriveRequiredResponse(response, body)) {
        notifyGoogleDriveRequired()
      }
      return null
    }
    if (!response.ok) return null
    return await response.arrayBuffer()
  } catch {
    return null
  }
}

async function fetchClinicAttachment(
  params: Record<string, string>,
): Promise<Record<string, unknown> | null> {
  const auth = getStoredApiAuth()
  if (!auth?.token) return null
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value)
  }
  const tenantId = String(auth.user.clinicId || auth.user.id || '').trim()
  if (tenantId) search.set('tenant_id', tenantId)
  const paths = [`/api/sync/attachment?${search.toString()}`]
  const fileId = params.id || params.aidId || params.fileId
  if (fileId) paths.push(`/api/sync/files/${encodeURIComponent(fileId)}?${search.toString()}`)

  let driveRequired = false
  for (const path of paths) {
    try {
      const response = await fetchWithTimeout(path, {
        headers: {
          Accept: 'application/json',
          ...identityHeaders(),
        },
      })
      const body = await response.json().catch(() => ({}))
      if (isGoogleDriveRequiredResponse(response, body)) {
        driveRequired = true
        continue
      }
      if (!response.ok) continue
      if (!body?.attachment) continue
      return payloadOf(body.attachment)
    } catch {
      // siguiente ruta
    }
  }
  if (driveRequired) {
    notifyGoogleDriveRequired()
  }
  return null
}

/**
 * Garantiza una copia local del adjunto.
 * Orden: IndexedDB → proxy Google Drive (`driveFileId`) → sync clinic attachment.
 */
export async function ensureLocalDiagnosticAidBlob(
  entry: DiagnosticAid,
): Promise<DiagnosticAidBlobRecord | null> {
  const local = await getDiagnosticAidBlobByAidId(entry.id)
  if (local?.data) return local

  if (entry.fileHash) {
    const hashedMatches = await db.diagnosticAids.where('fileHash').equals(entry.fileHash).toArray()
    for (const byHash of hashedMatches) {
      if (!byHash?.id) continue
      const hashedBlob = await getDiagnosticAidBlobByAidId(byHash.id)
      if (!hashedBlob?.data) continue
      if (byHash.id === entry.id) return hashedBlob
      const blobId = await saveDiagnosticAidBlobFromBuffer(entry.id, {
        fileName: hashedBlob.fileName || entry.fileName,
        mimeType: hashedBlob.mimeType,
        data: hashedBlob.data,
      })
      await db.diagnosticAids.update(entry.id, { blobId })
      entry.blobId = blobId
      return (await getDiagnosticAidBlobByAidId(entry.id)) ?? null
    }
  }

  if (entry.driveFileId) {
    const fromDrive = await fetchDiagnosticAidFromGoogleDrive(entry)
    if (fromDrive) {
      const saved = await persistArrayBuffer(
        entry,
        fromDrive,
        mimeTypeForDiagnosticFile(entry.fileName),
      )
      if (saved) return saved
    }
  }

  const patientId = String(entry.patientSyncId || entry.patientId || '')
  const encounterId = String(entry.encounterId || '')
  const queries: Record<string, string>[] = [
    { id: entry.id, aidId: entry.id, fileHash: entry.fileHash },
    { id: entry.id, fileHash: entry.fileHash, patientId, encounterId, evolutionId: encounterId },
    { fileHash: entry.fileHash, patientId, encounterId, evolutionId: encounterId },
    { fileHash: entry.fileHash },
    { patientId, encounterId, evolutionId: encounterId },
    { aidId: entry.id },
  ]

  for (const query of queries) {
    try {
      const payload = await fetchClinicAttachment(query)
      if (!payload) continue
      const saved = await persistRemoteBlob(entry, payload)
      if (saved) return saved
    } catch {
      // siguiente criterio de búsqueda
    }
  }

  return null
}
