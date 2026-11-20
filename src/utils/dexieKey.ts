/**
 * Claves IndexedDB/Dexie válidas. Evita el crash:
 * "Invalid key provided. Keys must be of type string, number, Date or Array<…>"
 * que ocurre con null/undefined/boolean/object en WhereClause.equals / Table.update.
 */

export type DexieScalarKey = string | number | Date

export function isDexieScalarKey(value: unknown): value is DexieScalarKey {
  if (value == null) return false
  const t = typeof value
  if (t === 'string' || t === 'number') return true
  return value instanceof Date && !Number.isNaN(value.getTime())
}

/** Devuelve la clave si es usable; si no, null (no consultar Dexie). */
export function asDexieScalarKey(value: unknown): DexieScalarKey | null {
  if (!isDexieScalarKey(value)) return null
  if (typeof value === 'string' && value.trim() === '') return null
  return value
}

export function asDexieStringKey(value: unknown): string | null {
  if (value == null) return null
  const text = String(value).trim()
  return text ? text : null
}
