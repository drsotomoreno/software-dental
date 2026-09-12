import { db } from '@/db/database'
import { getStoredApiAuth } from '@/services/apiAuthService'
import {
  getDiagnosticAidBlobByAidId,
  saveDiagnosticAidBlobFromBuffer,
} from '@/services/diagnosticAidBlobStore'
import type { DiagnosticAid, DiagnosticAidBlobRecord } from '@/types/diagnosticAid'
import { base64ToArrayBuffer } from '@/utils/base64Binary'
import { mimeTypeForDiagnosticFile } from '@/utils/diagnosticAidWebClassification'

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

function payloadOf(record: unknown): Record<string, unknown> {
  if (!record || typeof record !== 'object') return {}
  const value = record as { payload?: Record<string, unknown> }
  if (value.payload && typeof value.payload === 'object') return value.payload
  return record as Record<string, unknown>
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

async function fetchClinicAttachment(params: Record<string, string>): Promise<Record<string, unknown> | null> {
  const auth = getStoredApiAuth()
  if (!auth?.token) return null
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value)
  }
  const tenantId = String(auth.user.clinicId || auth.user.id || '').trim()
  if (tenantId) search.set('tenant_id', tenantId)
  const response = await fetch(`/api/sync/attachment?${search.toString()}`, {
    headers: {
      Accept: 'application/json',
      ...identityHeaders(),
    },
  })
  if (!response.ok) return null
  const body = await response.json().catch(() => ({}))
  if (!body?.attachment) return null
  return payloadOf(body.attachment)
}

/**
 * Garantiza una copia local del adjunto. Si el hash no está en IndexedDB,
 * lo descarga del snapshot de la clínica usando paciente/evolución.
 */
export async function ensureLocalDiagnosticAidBlob(
  entry: DiagnosticAid,
): Promise<DiagnosticAidBlobRecord | null> {
  const local = await getDiagnosticAidBlobByAidId(entry.id)
  if (local?.data) return local

  if (entry.fileHash) {
    const byHash = await db.diagnosticAids.where('fileHash').equals(entry.fileHash).first()
    if (byHash?.id && byHash.id !== entry.id) {
      const hashedBlob = await getDiagnosticAidBlobByAidId(byHash.id)
      if (hashedBlob?.data) {
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
  }

  const queries: Record<string, string>[] = [
    { id: entry.id, aidId: entry.id, fileHash: entry.fileHash },
    {
      patientId: String(entry.patientId || ''),
      encounterId: String(entry.encounterId || ''),
      fileHash: entry.fileHash,
    },
    {
      patientId: String(entry.patientSyncId || entry.patientId || ''),
      encounterId: String(entry.encounterId || ''),
    },
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
