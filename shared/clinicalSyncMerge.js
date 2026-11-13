/**
 * Merge no destructivo de registros de sync clínico.
 * Conserva llaves del destino cuando el entrante las omite (undefined)
 * o trae un payload con menos propiedades.
 */

/**
 * @param {Record<string, unknown>|null|undefined} base
 * @param {Record<string, unknown>|null|undefined} incoming
 * @returns {Record<string, unknown>}
 */
export function mergePayloadNonDestructive(base, incoming) {
  const prev = base && typeof base === 'object' && !Array.isArray(base) ? { ...base } : {}
  const next = incoming && typeof incoming === 'object' && !Array.isArray(incoming) ? incoming : {}
  const out = { ...prev }
  for (const [key, value] of Object.entries(next)) {
    if (value === undefined) continue
    out[key] = value
  }
  return out
}

/**
 * Fusiona registro sync: metadatos del ganador + payload no destructivo.
 * @param {object|null|undefined} prev
 * @param {object} next
 * @param {{ preferNextMeta?: boolean }} [options]
 */
export function mergeSyncedRecordNonDestructive(prev, next, options = {}) {
  if (!prev || typeof prev !== 'object') return next
  if (!next || typeof next !== 'object') return prev
  const preferNextMeta = options.preferNextMeta !== false
  const metaBase = preferNextMeta ? { ...prev, ...next } : { ...next, ...prev }
  return {
    ...metaBase,
    syncId: next.syncId || prev.syncId,
    clinicId: next.clinicId || prev.clinicId || metaBase.clinicId,
    updatedAt: preferNextMeta
      ? next.updatedAt || prev.updatedAt
      : prev.updatedAt || next.updatedAt,
    deletedAt:
      preferNextMeta
        ? next.deletedAt !== undefined
          ? next.deletedAt
          : prev.deletedAt
        : prev.deletedAt !== undefined
          ? prev.deletedAt
          : next.deletedAt,
    serverUpdatedAt: preferNextMeta
      ? next.serverUpdatedAt || prev.serverUpdatedAt
      : prev.serverUpdatedAt || next.serverUpdatedAt,
    payload: mergePayloadNonDestructive(prev.payload, next.payload),
  }
}

/**
 * Conserva en `local` las propiedades que `incoming` no declara (undefined / ausentes).
 * Pensado para Dexie tras applyPayload.
 * @param {Record<string, unknown>|null|undefined} local
 * @param {Record<string, unknown>} incoming
 */
export function preserveOmittedLocalFields(local, incoming) {
  if (!local || typeof local !== 'object') return incoming
  const out = { ...incoming }
  for (const [key, value] of Object.entries(local)) {
    if (key === 'id') continue
    if (!Object.prototype.hasOwnProperty.call(incoming, key) || incoming[key] === undefined) {
      if (value !== undefined) out[key] = value
    }
  }
  return out
}
