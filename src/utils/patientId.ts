import { db } from '@/db/database'
import type { Patient } from '@/types/patient'
import type { OdontogramData } from '@/types/odontogram'
import { odontogramHasMarks, pickOdontogramFromCandidates } from '@/utils/odontogramPersistence'

/**
 * Dexie usa ++id (número) como clave primaria, pero React Router
 * entrega el parámetro :id siempre como string. IndexedDB no considera
 * equivalentes 1 y "1", por lo que hay que normalizar.
 */
export function toDexiePrimaryKey(id: string): number | string {
  if (/^\d+$/.test(id)) return parseInt(id, 10)
  return id
}

export function toPatientForeignKey(id: string | number): string {
  return String(id)
}

export async function getPatientByRouteId(routeId: string): Promise<Patient | null> {
  const numericKey = toDexiePrimaryKey(routeId)
  let patient = await db.patients.get(numericKey)

  if (!patient && typeof numericKey === 'number') {
    patient = await db.patients.get(String(numericKey))
  }

  return patient ?? null
}

export async function listOdontogramsForPatient(routeId: string): Promise<OdontogramData[]> {
  const stringKey = toPatientForeignKey(routeId)
  const numericKey = toDexiePrimaryKey(routeId)
  const byString = await db.odontograms.where('patientId').equals(stringKey).toArray()
  const byNumeric =
    typeof numericKey === 'number'
      ? await db.odontograms.where('patientId').equals(numericKey).toArray()
      : []

  const unique = new Map<string, OdontogramData>()
  for (const row of [...byString, ...byNumeric]) {
    unique.set(String(row.id ?? `${row.patientId}:${row.updatedAt}`), row)
  }
  return [...unique.values()]
}

/** Una sola ficha por paciente: la que tiene las marcas, no la primera fila vacía. */
export async function getOdontogramByPatientRouteId(
  routeId: string,
): Promise<OdontogramData | undefined> {
  return pickOdontogramFromCandidates(await listOdontogramsForPatient(routeId)) ?? undefined
}

export async function upsertPatientOdontogram(
  routeId: string,
  odontogram: OdontogramData,
): Promise<OdontogramData> {
  const patientId = toPatientForeignKey(routeId)
  const existing = await listOdontogramsForPatient(patientId)
  const canonical =
    existing.find((row) => odontogram.id != null && String(row.id) === String(odontogram.id)) ??
    pickOdontogramFromCandidates(existing)

  // Un chart vacío con otro id (copia por defecto o fila duplicada) no borra las marcas.
  if (
    canonical &&
    odontogramHasMarks(canonical) &&
    !odontogramHasMarks(odontogram) &&
    String(odontogram.id ?? '') !== String(canonical.id ?? '')
  ) {
    for (const row of existing) {
      if (row.id == null || String(row.id) === String(canonical.id)) continue
      await db.odontograms.delete(row.id)
    }
    return canonical
  }

  const payload: OdontogramData = {
    ...(canonical ?? odontogram),
    ...odontogram,
    patientId,
    updatedAt: odontogram.updatedAt || new Date().toISOString(),
    syncId: odontogram.syncId ?? canonical?.syncId,
    clinicId: odontogram.clinicId ?? canonical?.clinicId,
  }

  const saved =
    canonical?.id == null
      ? await insertOdontogram(payload)
      : await replaceOdontogram(canonical.id, payload)

  for (const row of existing) {
    if (row.id == null || String(row.id) === String(saved.id)) continue
    await db.odontograms.delete(row.id)
  }

  return saved
}

async function insertOdontogram(payload: OdontogramData): Promise<OdontogramData> {
  const withoutId = { ...payload }
  delete withoutId.id
  const newId = await db.odontograms.add(withoutId)
  return { ...withoutId, id: newId }
}

async function replaceOdontogram(
  id: OdontogramData['id'],
  payload: OdontogramData,
): Promise<OdontogramData> {
  const withoutId = { ...payload, id }
  delete withoutId.id
  await db.odontograms.update(id!, withoutId)
  return { ...withoutId, id }
}
