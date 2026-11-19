/**
 * Nombre IndexedDB canónico por clínica/propietario.
 * Nunca usa `superadmin-session` ni UUIDs efímeros de sesión como segmento.
 * Fórmula: DentalEMR_canonical_${canonicalClinicKey}
 */
import { resolveClinicSyncId } from './clinicalSyncScope.js'

const EPHEMERAL_SEGMENTS = new Set(['superadmin-session', 'anon', 'none', 'null', 'undefined'])

export function sanitizeDentalDbSegment(value) {
  const cleaned = String(value ?? '')
    .trim()
    .replace(/^clinic:/i, '')
    .replace(/[^a-zA-Z0-9._@-]+/g, '_')
    .slice(0, 80)
  return cleaned || 'anon'
}

function isEphemeralSegment(segment) {
  const s = String(segment || '').trim().toLowerCase()
  if (!s) return true
  if (EPHEMERAL_SEGMENTS.has(s)) return true
  if (s.startsWith('superadmin-session')) return true
  return false
}

/**
 * Clave de clínica estable (sin prefijo clinic:, sin session efímera).
 * @param {object | null | undefined} user
 * @param {{ userId?: string | null, clinicaId?: string | null }} [overrides]
 */
export function resolveCanonicalClinicDbKey(user, overrides = {}) {
  const userForScope = {
    ...(user && typeof user === 'object' ? user : {}),
    ...(overrides.userId ? { id: String(overrides.userId) } : {}),
    ...(overrides.clinicaId ? { clinicId: String(overrides.clinicaId) } : {}),
  }
  const email = String(userForScope.email || user?.email || '').trim().toLowerCase()
  const fromScope = resolveClinicSyncId(userForScope)
  const candidates = [
    fromScope,
    overrides.clinicaId,
    userForScope.clinicId,
    user?.clinicId,
    email,
    userForScope.id,
    user?.id,
  ]
  for (const raw of candidates) {
    const seg = sanitizeDentalDbSegment(raw)
    if (!isEphemeralSegment(seg)) return seg
  }
  if (email && !isEphemeralSegment(sanitizeDentalDbSegment(email))) {
    return sanitizeDentalDbSegment(email)
  }
  return 'unknown-clinic'
}

/**
 * DentalEMR_canonical_${canonicalClinicKey}
 * @param {object | null | undefined} user sesión (id, clinicId, email)
 * @param {{ userId?: string | null, clinicaId?: string | null }} [overrides]
 */
export function resolveDentalEmrDbNameFromUser(user, overrides = {}) {
  const cid = resolveCanonicalClinicDbKey(user, overrides)
  return `DentalEMR_canonical_${cid}`
}

/** Patrón legacy split-brain: DentalEMR_{userId}_{userId} */
export function orphanUuidDentalEmrDbName(userId) {
  const uid = sanitizeDentalDbSegment(userId)
  return `DentalEMR_${uid}_${uid}`
}

/**
 * ¿Es la base huérfana UUID distinta de la canónica actual?
 * Si clinicId del dueño === userId (clínica normal), no es huérfana bajo el esquema legacy.
 */
export function isOrphanUuidDentalEmrDb(dbName, userId, canonicalDbName) {
  const orphan = orphanUuidDentalEmrDbName(userId)
  const name = String(dbName || '').trim()
  const canonical = String(canonicalDbName || '').trim()
  if (!name || !canonical || name !== orphan) return false
  return orphan !== canonical
}

/** ¿Nombre IndexedDB EMR (actual o legacy)? */
export function isDentalEmrDatabaseName(name) {
  const n = String(name || '').trim()
  return n === 'DentalEMR' || n.startsWith('DentalEMR_')
}
