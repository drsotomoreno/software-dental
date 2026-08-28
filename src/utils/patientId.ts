import { db } from '@/db/database'
import type { Patient } from '@/types/patient'
import type { OdontogramData } from '@/types/odontogram'

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

export async function getOdontogramByPatientRouteId(
  routeId: string,
): Promise<OdontogramData | undefined> {
  const stringKey = toPatientForeignKey(routeId)
  const numericKey = toDexiePrimaryKey(routeId)

  let existing = await db.odontograms.where('patientId').equals(stringKey).first()

  if (!existing && typeof numericKey === 'number') {
    existing = await db.odontograms.where('patientId').equals(numericKey).first()
  }

  return existing
}
