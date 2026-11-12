/**
 * Nombre IndexedDB particionado por usuario + clínica canónica.
 * Debe coincidir siempre con resolveClinicSyncId (nunca UUID crudo del
 * Superadmin cuando existe correo maestro).
 */
import { resolveClinicSyncId } from './clinicalSyncScope.js'

export function sanitizeDentalDbSegment(value) {
  const cleaned = String(value ?? '')
    .trim()
    .replace(/^clinic:/i, '')
    .replace(/[^a-zA-Z0-9._@-]+/g, '_')
    .slice(0, 80)
  return cleaned || 'anon'
}

/**
 * DentalEMR_${userId}_${clinicaCanonica}
 * @param {object | null | undefined} user sesión (id, clinicId, email)
 * @param {{ userId?: string | null, clinicaId?: string | null }} [overrides]
 */
export function resolveDentalEmrDbNameFromUser(user, overrides = {}) {
  const uid = sanitizeDentalDbSegment(overrides.userId || user?.id || 'anon')
  const userForScope = {
    ...(user && typeof user === 'object' ? user : {}),
    ...(overrides.userId ? { id: String(overrides.userId) } : {}),
    ...(overrides.clinicaId ? { clinicId: String(overrides.clinicaId) } : {}),
  }
  const canonical =
    resolveClinicSyncId(userForScope) ||
    String(overrides.clinicaId || '').trim() ||
    String(user?.clinicId || user?.id || 'none')
  const cid = sanitizeDentalDbSegment(canonical)
  return `DentalEMR_${uid}_${cid}`
}

/** Patrón legacy split-brain: DentalEMR_{userId}_{userId} */
export function orphanUuidDentalEmrDbName(userId) {
  const uid = sanitizeDentalDbSegment(userId)
  return `DentalEMR_${uid}_${uid}`
}

/**
 * ¿Es la base huérfana UUID distinta de la canónica actual?
 * Si clinicId del dueño === userId (clínica normal), no es huérfana.
 */
export function isOrphanUuidDentalEmrDb(dbName, userId, canonicalDbName) {
  const orphan = orphanUuidDentalEmrDbName(userId)
  const name = String(dbName || '').trim()
  const canonical = String(canonicalDbName || '').trim()
  if (!name || !canonical || name !== orphan) return false
  return orphan !== canonical
}
