import { db } from '@/db/database'
import type { DiagnosticAidBlobRecord } from '@/types/diagnosticAid'
import { generateId } from '@/utils/crypto'
import { mimeTypeForDiagnosticFile } from '@/utils/diagnosticAidWebClassification'

export type { DiagnosticAidBlobRecord }

export async function saveDiagnosticAidBlob(
  aidId: string,
  file: File,
): Promise<string> {
  const id = generateId()
  const record: DiagnosticAidBlobRecord = {
    id,
    aidId,
    fileName: file.name,
    mimeType: file.type || mimeTypeForDiagnosticFile(file.name),
    data: await file.arrayBuffer(),
    createdAt: new Date().toISOString(),
  }
  await db.diagnosticAidBlobs.add(record)
  return id
}

export async function getDiagnosticAidBlobByAidId(
  aidId: string,
): Promise<DiagnosticAidBlobRecord | undefined> {
  return db.diagnosticAidBlobs.where('aidId').equals(aidId).first()
}

export async function getDiagnosticAidBlobUrl(aidId: string): Promise<string | null> {
  const record = await getDiagnosticAidBlobByAidId(aidId)
  if (!record) return null
  const blob = new Blob([record.data], { type: record.mimeType })
  return URL.createObjectURL(blob)
}

export async function downloadDiagnosticAidBlob(aidId: string, fileName: string): Promise<boolean> {
  const record = await getDiagnosticAidBlobByAidId(aidId)
  if (!record) return false

  const blob = new Blob([record.data], { type: record.mimeType })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName || record.fileName
  anchor.click()
  URL.revokeObjectURL(url)
  return true
}

export async function deleteDiagnosticAidBlob(aidId: string): Promise<void> {
  const record = await getDiagnosticAidBlobByAidId(aidId)
  if (record) {
    await db.diagnosticAidBlobs.delete(record.id)
  }
}
