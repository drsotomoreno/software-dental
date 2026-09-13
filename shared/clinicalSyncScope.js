/** Alcance estable de sincronización clínica entre dispositivos de CUALQUIER cuenta. */
export const SUPERADMIN_SYNC_EMAIL = 'doctormauriciosoto@gmail.com'
export const SUPERADMIN_CLINIC_SYNC_ID = `clinic:${SUPERADMIN_SYNC_EMAIL}`

function normalizeEmail(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
}

function isMasterSuperAdmin(user) {
  return normalizeEmail(user?.email) === SUPERADMIN_SYNC_EMAIL
}

/** Id de la clínica (titular). Colaboradores usan clinicId del dueño, no su user.id. */
export function tenantIdOf(user) {
  if (!user || typeof user !== 'object') return ''
  if (isMasterSuperAdmin(user)) return SUPERADMIN_SYNC_EMAIL
  return String(user.clinicId || user.id || '').trim()
}

/**
 * Misma clave en todos los equipos de la misma clínica:
 * dueño, colaboradores y cualquier dispositivo con la misma sesión.
 */
export function resolveClinicSyncId(user) {
  const tenantId = tenantIdOf(user)
  if (!tenantId) return ''
  if (tenantId.startsWith('clinic:')) return tenantId
  return `clinic:${tenantId}`
}

function addKey(set, value) {
  const key = String(value || '').trim()
  if (key) set.add(key)
}

/** Cubo canónico + ids legacy (UUID crudo, user.id del colaborador, superadmin-session). */
export function clinicSyncAliasIds(user) {
  const canonical = resolveClinicSyncId(user)
  const aliases = new Set()
  addKey(aliases, canonical)

  const userId = String(user?.id || '').trim()
  const clinicId = String(user?.clinicId || '').trim()
  const tenantId = tenantIdOf(user)

  for (const raw of [userId, clinicId, tenantId]) {
    addKey(aliases, raw)
    if (raw && !raw.startsWith('clinic:')) addKey(aliases, `clinic:${raw}`)
  }

  if (isMasterSuperAdmin(user)) {
    addKey(aliases, SUPERADMIN_CLINIC_SYNC_ID)
    addKey(aliases, SUPERADMIN_SYNC_EMAIL)
    addKey(aliases, 'superadmin-session')
    addKey(aliases, `clinic:${SUPERADMIN_SYNC_EMAIL}`)
  }

  return { canonical, aliases: [...aliases].filter(Boolean) }
}
