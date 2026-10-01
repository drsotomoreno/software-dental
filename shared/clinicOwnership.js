/** Identidad de clínica: un solo titular por cuenta. */

export function textId(value) {
  if (Array.isArray(value)) return textId(value[0])
  if (value == null) return ''
  return String(value).trim()
}

export function memberClinicId(user) {
  return textId(user?.clinicId || user?.id)
}

/** Titular solo si la cuenta guarda explícitamente clinicId igual a su id. */
export function isRecordedOwner(user) {
  const id = textId(user?.id)
  const clinicId = textId(user?.clinicId)
  if (!id || !clinicId) return false
  return id === clinicId
}

export function belongsToClinic(user, ownerId) {
  const owner = textId(ownerId)
  if (!owner || !user) return false
  const id = textId(user.id)
  const clinicId = textId(user.clinicId)
  return id === owner || clinicId === owner
}

/**
 * Elige el único titular de un grupo.
 * Prefiere el id al que ya apuntan los colaboradores; si no, la pista de la sesión;
 * si no, el titular registrado más antiguo.
 */
export function canonicalOwnerId(users, clinicIdHint) {
  const list = (Array.isArray(users) ? users : []).filter((user) => textId(user?.id))
  const hint = textId(clinicIdHint)
  const inClinic = hint
    ? list.filter((user) => belongsToClinic(user, hint) || textId(user.clinicId) === hint)
    : list
  const pool = inClinic.length ? inClinic : hint ? [] : list
  if (!pool.length) return hint

  const pointed = new Map()
  for (const user of pool) {
    const clinicId = textId(user.clinicId)
    const id = textId(user.id)
    if (!clinicId || clinicId === id) continue
    pointed.set(clinicId, (pointed.get(clinicId) || 0) + 1)
  }

  let best = ''
  let bestCount = 0
  for (const [id, count] of pointed) {
    if (count > bestCount && pool.some((user) => textId(user.id) === id)) {
      best = id
      bestCount = count
    }
  }
  if (best) return best
  if (hint && pool.some((user) => textId(user.id) === hint)) return hint

  const recorded = pool.filter((user) => isRecordedOwner(user))
  const source = recorded.length ? recorded : pool
  const sorted = [...source].sort((left, right) => {
    const leftTime = Date.parse(left.createdAt || 0) || 0
    const rightTime = Date.parse(right.createdAt || 0) || 0
    if (leftTime !== rightTime) return leftTime - rightTime
    return textId(left.id).localeCompare(textId(right.id))
  })
  return textId(sorted[0]?.id) || hint
}

/**
 * Deja un solo titular en esa clínica. No mezcla otras clínicas.
 * @returns {boolean} true si modificó algún registro
 */
export function alignClinicOwnership(users, ownerId) {
  const owner = textId(ownerId)
  if (!owner || !Array.isArray(users)) return false
  let changed = false
  for (const user of users) {
    if (!user || !belongsToClinic(user, owner)) continue
    const id = textId(user.id)
    const shouldOwn = id === owner
    if (textId(user.clinicId) !== owner) {
      user.clinicId = owner
      changed = true
    }
    if (Boolean(user.isClinicOwner) !== shouldOwn) {
      user.isClinicOwner = shouldOwn
      changed = true
    }
    if (shouldOwn) {
      const role = textId(user.rol || user.role).toLowerCase()
      if (role && role !== 'superadmin' && role !== 'admin') {
        if (user.rol != null) user.rol = 'admin'
        if (user.role != null) user.role = 'admin'
        changed = true
      }
    }
  }
  return changed
}

export function documentDigits(value) {
  return textId(value).replace(/\D/g, '')
}

/** Misma persona por id, correo o cédula. */
export function samePerson(user, other) {
  if (!user || !other) return false
  const leftId = textId(user.id)
  const rightId = textId(other.id)
  if (leftId && rightId && leftId === rightId) return true
  const leftEmail = textId(user.email).toLowerCase()
  const rightEmail = textId(other.email).toLowerCase()
  if (leftEmail && rightEmail && leftEmail === rightEmail) return true
  const leftDoc = documentDigits(user.documentNumber)
  const rightDoc = documentDigits(other.documentNumber)
  return Boolean(leftDoc && rightDoc && leftDoc === rightDoc)
}

/**
 * Titular de la cuenta que está en pantalla.
 * Si quien inició sesión ya es titular, esa persona gana aunque haya otro
 * registro marcado como titular (por ejemplo el usuario demo).
 */
export function resolveAccountOwnerId(users, session) {
  const list = (Array.isArray(users) ? users : []).filter((user) => textId(user?.id))
  const member = list.find((user) => samePerson(user, session))
  const role = textId(member?.rol || member?.role).toLowerCase()
  if (
    member &&
    (isRecordedOwner(member) || member.isClinicOwner === true || role === 'superadmin')
  ) {
    return textId(member.id)
  }
  const hint = textId(session?.clinicId || member?.clinicId || session?.id)
  const ownerId = canonicalOwnerId(list, hint)
  if (ownerId && list.some((user) => textId(user.id) === ownerId)) return ownerId
  if (member) return textId(member.id)
  return ownerId
}

/**
 * Deja un solo titular y mueve a toda la lista a esa clínica.
 * Sirve para la cuenta que el navegador está mostrando, no para mezclar clínicas del servidor.
 * @returns {boolean} true si modificó algún registro
 */
export function attachRosterToOwner(users, ownerId) {
  const owner = textId(ownerId)
  if (!owner || !Array.isArray(users)) return false
  let changed = false
  for (const user of users) {
    if (!user || !textId(user.id)) continue
    const shouldOwn = textId(user.id) === owner
    if (textId(user.clinicId) !== owner) {
      user.clinicId = owner
      changed = true
    }
    if (Boolean(user.isClinicOwner) !== shouldOwn) {
      user.isClinicOwner = shouldOwn
      changed = true
    }
    if (shouldOwn) {
      const role = textId(user.rol || user.role).toLowerCase()
      if (role && role !== 'superadmin' && role !== 'admin') {
        if (user.rol != null) user.rol = 'admin'
        if (user.role != null) user.role = 'admin'
        changed = true
      }
    }
  }
  return changed
}

export function canRemoveClinicMember(actorId, target, ownerId) {
  if (!target) return { ok: false, error: 'Usuario no encontrado.' }
  if (textId(actorId) && textId(actorId) === textId(target.id)) {
    return { ok: false, error: 'No puede eliminar su propio usuario.' }
  }
  if (textId(target.id) === textId(ownerId)) {
    return { ok: false, error: 'No puede eliminar al titular de la clínica.' }
  }
  return { ok: true }
}
