import { db } from '@/db/database'
import { getCurrentClinicId, notifyClinicalRecordDirty } from '@/services/clinicalSyncState'
import type { DiagnosticAid } from '@/types/diagnosticAid'
import type { SyncQueueAttachment } from '@/types/syncQueue'
import { generateId } from '@/utils/crypto'
import { mimeTypeForDiagnosticFile } from '@/utils/diagnosticAidWebClassification'

export async function resolvePatientSyncId(patientId: string): Promise<string | undefined> {
  if (!patientId) return undefined
  const patient =
    (await db.patients.get(patientId)) ||
    (/^\d+$/.test(patientId) ? await db.patients.get(Number(patientId)) : undefined)
  return patient?.syncId
}

export async function enqueueDiagnosticAidForSync(
  entry: DiagnosticAid,
  extras: Partial<SyncQueueAttachment> = {},
): Promise<SyncQueueAttachment> {
  const existing = await db.syncQueue.where('aidId').equals(entry.id).first()
  const now = new Date().toISOString()
  const item: SyncQueueAttachment = {
    id: existing?.id || generateId(),
    entityType: 'diagnostic_aid',
    action: 'UPSERT',
    status: 'pending',
    patientId: String(entry.patientId),
    encounterId: String(entry.encounterId || ''),
    patientSyncId: entry.patientSyncId || (await resolvePatientSyncId(String(entry.patientId))),
    aidId: entry.id,
    blobId: entry.blobId ?? extras.blobId ?? null,
    fileName: entry.fileName,
    fileHash: entry.fileHash,
    mimeType: extras.mimeType || mimeTypeForDiagnosticFile(entry.fileName),
    absolutePath: entry.absolutePath,
    clinicId: entry.clinicId || getCurrentClinicId(),
    createdAt: existing?.createdAt || entry.createdAt || now,
    updatedAt: now,
  }
  Object.assign(item, extras, { status: 'pending' as const })

  if (existing?.id) {
    await db.syncQueue.update(existing.id, item)
  } else {
    await db.syncQueue.add(item)
  }
  notifyClinicalRecordDirty()
  return item
}

export async function listPendingSyncQueue(): Promise<SyncQueueAttachment[]> {
  return db.syncQueue.where('status').equals('pending').toArray()
}

export async function markSyncQueueSynced(ids: string[]): Promise<void> {
  const now = new Date().toISOString()
  await db.transaction('rw', db.syncQueue, async () => {
    for (const id of ids) {
      await db.syncQueue.update(id, { status: 'synced', lastSyncedAt: now, updatedAt: now })
    }
  })
}
