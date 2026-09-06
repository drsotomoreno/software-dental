import { db } from '@/db/database'
import type {
  DiagnosticAidDerivative,
  DiagnosticAidDerivativeKind,
  DiagnosticAidSlicePlane,
  DiagnosticAidStudyKind,
  DiagnosticAidViewerStatus,
} from '@/types/diagnosticAid'
import { generateId } from '@/utils/crypto'

export async function replaceDerivativesForAid(
  aidId: string,
  items: Array<Omit<DiagnosticAidDerivative, 'id' | 'aidId' | 'createdAt' | 'bytes'> & { bytes?: number }>,
): Promise<void> {
  const existing = await db.diagnosticAidDerivatives.where('aidId').equals(aidId).toArray()
  if (existing.length) {
    await db.diagnosticAidDerivatives.bulkDelete(existing.map((row) => row.id))
  }
  if (!items.length) return
  const now = new Date().toISOString()
  await db.diagnosticAidDerivatives.bulkAdd(
    items.map((item) => ({
      id: generateId(),
      aidId,
      kind: item.kind,
      plane: item.plane,
      index: item.index,
      mimeType: item.mimeType,
      data: item.data,
      bytes: item.bytes ?? item.data.byteLength,
      createdAt: now,
    })),
  )
}

export async function deleteDerivativesForAid(aidId: string): Promise<void> {
  const existing = await db.diagnosticAidDerivatives.where('aidId').equals(aidId).toArray()
  if (existing.length) {
    await db.diagnosticAidDerivatives.bulkDelete(existing.map((row) => row.id))
  }
}

export async function listDerivativesForAid(aidId: string): Promise<DiagnosticAidDerivative[]> {
  return db.diagnosticAidDerivatives.where('aidId').equals(aidId).toArray()
}

export async function getDerivative(
  aidId: string,
  kind: DiagnosticAidDerivativeKind,
): Promise<DiagnosticAidDerivative | undefined> {
  return db.diagnosticAidDerivatives.where('[aidId+kind]').equals([aidId, kind]).first()
}

export async function listSlices(
  aidId: string,
  plane: DiagnosticAidSlicePlane,
): Promise<DiagnosticAidDerivative[]> {
  const rows = await db.diagnosticAidDerivatives.where('[aidId+kind]').equals([aidId, 'slice']).toArray()
  return rows
    .filter((row) => (row.plane ?? 'axial') === plane)
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
}

export async function getDerivativeBlobUrl(
  aidId: string,
  kind: DiagnosticAidDerivativeKind,
): Promise<string | null> {
  const row = await getDerivative(aidId, kind)
  if (!row) return null
  return URL.createObjectURL(new Blob([row.data], { type: row.mimeType }))
}

export async function updateViewerMeta(
  aidId: string,
  patch: {
    studyKind?: DiagnosticAidStudyKind
    viewerStatus?: DiagnosticAidViewerStatus
    viewerError?: string
    sliceCount?: number
  },
): Promise<void> {
  await db.diagnosticAids.update(aidId, patch)
}
