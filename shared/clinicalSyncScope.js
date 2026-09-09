/** Alcance estable de sincronización clínica entre dispositivos. */
export const SUPERADMIN_SYNC_EMAIL = 'doctormauriciosoto@gmail.com'
export const SUPERADMIN_CLINIC_SYNC_ID = `clinic:${SUPERADMIN_SYNC_EMAIL}`

function normalizeEmail(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
}

function isSuperAdminLike(user) {
  if (!user || typeof user !== 'object') return false
  const email = normalizeEmail(user.email)
  const rol = String(user.rol || user.role || '')
    .trim()
    .toLowerCase()
  return (
    email === SUPERADMIN_SYNC_EMAIL ||
    rol === 'superadmin' ||
    user.estado_pago === 'exento'
  )
}

/** Misma clínica en todos los equipos de la misma cuenta. */
export function resolveClinicSyncId(user) {
  if (!user || typeof user !== 'object') return ''
  if (isSuperAdminLike(user)) return SUPERADMIN_CLINIC_SYNC_ID
  return String(user.clinicId || user.id || '').trim()
}

/** Incluye ids legacy (UUID, superadmin-session) para migrar datos ya guardados. */
export function clinicSyncAliasIds(user) {
  const canonical = resolveClinicSyncId(user)
  const aliases = new Set()
  if (canonical) aliases.add(canonical)
  const id = String(user?.id || '').trim()
  const clinicId = String(user?.clinicId || '').trim()
  if (id) aliases.add(id)
  if (clinicId) aliases.add(clinicId)
  if (isSuperAdminLike(user)) {
    aliases.add(SUPERADMIN_CLINIC_SYNC_ID)
    aliases.add('superadmin-session')
  }
  return { canonical, aliases: [...aliases].filter(Boolean) }
}
