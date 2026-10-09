/**
 * Los auxiliares (rol recepción) pertenecen a la clínica del titular.
 * No tienen clínica propia. Si clinicId falta o es su propio id, desaparecen
 * de Gestión de Usuarios aunque el registro siga en el almacén.
 */

const STAFF_ROLES = new Set(['superadmin', 'admin', 'odontologo', 'recepcion'])

export function normalizeStaffRole(rol) {
  const value = String(rol ?? '').trim().toLowerCase()
  if (STAFF_ROLES.has(value)) return value
  if (value === 'administrador' || value === 'administracion' || value === 'administración') return 'admin'
  if (value === 'auxiliar' || value.startsWith('auxiliar')) return 'recepcion'
  return 'odontologo'
}

export function isAuxiliarRole(rol) {
  return normalizeStaffRole(rol) === 'recepcion'
}

function stamp(item) {
  return Date.parse(item?.updatedAt || item?.createdAt || 0) || 0
}

/** clinicId vacío o igual al id propio: el usuario no está dentro de otra clínica. */
export function isSelfBound(user) {
  if (!user?.id) return true
  const clinicId = String(user.clinicId || '')
  return !clinicId || clinicId === String(user.id)
}

function realClinicId(user) {
  if (!user?.id) return ''
  const clinicId = String(user.clinicId || '')
  if (!clinicId || clinicId === String(user.id)) return ''
  return clinicId
}

/**
 * Ficha de auxiliar, incluso si un inicio de sesión la promovió a admin
 * al quedarse sin clínica. Un odontólogo con ReTHUS no entra aquí.
 */
export function looksLikeAuxiliarRecord(user) {
  if (!user?.id) return false
  if (isAuxiliarRole(user.rol)) return true
  if (normalizeStaffRole(user.rol) !== 'admin') return false
  if (String(user.rethusNumber || '').trim()) return false
  const documentNumber = String(user.documentNumber || '').replace(/\D/g, '')
  const phone = String(user.phone || '').replace(/\D/g, '')
  return documentNumber.length >= 6 && phone.length >= 7
}

/**
 * El inicio de sesión no debe inventar una clínica propia ni promover a
 * administrador a un auxiliar. Eso la saca de la lista del titular.
 */
export function applyLoginClinicBinding(user, { exempt = false } = {}) {
  if (!user || exempt) return user
  if (isAuxiliarRole(user.rol)) return user
  let next = user
  if (!next.clinicId) {
    next = { ...next, clinicId: next.id, updatedAt: new Date().toISOString() }
  }
  if (String(next.clinicId || '') === String(next.id)) {
    next = {
      ...next,
      rol: 'admin',
      accessEnabled: true,
      updatedAt: new Date().toISOString(),
    }
  }
  return next
}

/**
 * Al fusionar archivo y Postgres, no dejar que una copia vieja o desvinculada
 * borre la clínica, la cédula o la clave de la copia buena.
 * `incoming` es la versión que ganó por fecha; `previous` es la otra.
 */
export function mergeStaffUser(previous, incoming) {
  if (!previous) return incoming
  if (!incoming) return previous
  const incomingNewer = stamp(incoming) >= stamp(previous)
  const newer = incomingNewer ? incoming : previous
  const older = incomingNewer ? previous : incoming
  const merged = { ...older, ...newer }
  const keptClinic = realClinicId(newer) || realClinicId(older)
  if (keptClinic) merged.clinicId = keptClinic
  else if (newer.clinicId) merged.clinicId = newer.clinicId
  else if (older.clinicId) merged.clinicId = older.clinicId

  const newerSuspended = newer.accessEnabled === false
  if (newerSuspended) {
    merged.accessEnabled = false
    merged.passwordHash = ''
    merged.suspendedAt = newer.suspendedAt || newer.updatedAt || merged.suspendedAt
  } else if (!newer.passwordHash && older.passwordHash) {
    merged.passwordHash = older.passwordHash
    if (older.accessEnabled !== false) merged.accessEnabled = true
  }

  for (const field of ['documentNumber', 'documentType', 'email', 'phone', 'firstName', 'lastName', 'nombre', 'rethusNumber']) {
    if ((merged[field] == null || merged[field] === '') && older[field]) merged[field] = older[field]
  }

  const olderRole = normalizeStaffRole(older.rol)
  const newerRole = normalizeStaffRole(newer.rol)
  const newerLostClinic = !realClinicId(newer) && Boolean(realClinicId(older))
  if (newerLostClinic && olderRole === 'recepcion' && newerRole === 'admin') {
    merged.rol = 'recepcion'
  }

  if (older.createdAt && (!merged.createdAt || older.createdAt < merged.createdAt)) {
    merged.createdAt = older.createdAt
  }
  return merged
}

function clinicNameKey(user) {
  return String(user?.clinicName || '').trim().toLowerCase()
}

/**
 * No absorber cuentas exentas ni una prueba gratuita propia.
 * Pendiente también aparece en fichas viejas de auxiliares a las que el
 * almacén les puso ese estado por defecto al leerlas.
 */
function copiedStaffBilling(user) {
  const estado = String(user?.estado_pago || '')
  return estado !== 'exento' && estado !== 'prueba'
}

/**
 * Devuelve auxiliares que ya no aparecen en la clínica indicada.
 * No modifica el arreglo.
 */
export function findDetachedAuxiliares(users, clinicId) {
  const owner = (users || []).find((item) => String(item?.id) === String(clinicId)) || null
  const ownerName = clinicNameKey(owner)
  return (users || []).filter((user) => {
    if (!user?.id || String(user.id) === String(clinicId)) return false
    if (!isSelfBound(user)) return false
    if (!looksLikeAuxiliarRecord(user)) return false
    if (normalizeStaffRole(user.rol) === 'superadmin') return false
    if (isAuxiliarRole(user.rol)) return true
    if (!copiedStaffBilling(user)) return false
    return ownerName.length >= 4 && clinicNameKey(user) === ownerName
  })
}

/**
 * Vuelve a colgar de la clínica a auxiliares desvinculados cuando el nombre
 * de la sede coincide, o cuando el rol sigue siendo auxiliar y esta es la
 * única clínica real del almacén.
 */
export function recoverDetachedAuxiliares(users, clinicId, { soleClinic = false } = {}) {
  const list = Array.isArray(users) ? users : []
  const owner = list.find((item) => String(item?.id) === String(clinicId)) || null
  const ownerName = clinicNameKey(owner)
  const now = new Date().toISOString()
  const repaired = []
  const next = list.map((user) => {
    if (!user?.id || String(user.id) === String(clinicId)) return user
    if (!isSelfBound(user) || !looksLikeAuxiliarRecord(user)) return user
    if (normalizeStaffRole(user.rol) === 'superadmin') return user
    if (!isAuxiliarRole(user.rol) && !copiedStaffBilling(user)) return user
    const sameName = ownerName.length >= 4 && clinicNameKey(user) === ownerName
    const soleAuxiliar = soleClinic && isAuxiliarRole(user.rol)
    if (!sameName && !soleAuxiliar) return user
    repaired.push(user)
    return {
      ...user,
      clinicId: String(clinicId),
      rol: 'recepcion',
      updatedAt: now,
      repairedAt: now,
    }
  })
  return { users: next, changed: repaired.length > 0, repaired }
}

export function countRealClinics(users) {
  return (users || []).filter((user) => {
    if (!user?.id) return false
    if (isSelfBound(user) && looksLikeAuxiliarRecord(user)) return false
    return String(user.clinicId || user.id) === String(user.id)
  }).length
}
