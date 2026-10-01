import { db } from '@/db/database'
import type { AuthSession } from '@/types/auth'
import { SESSION_DURATION_MS, SESSION_STORAGE_KEY } from '@/types/auth'
import type { UserProfile, UserRole } from '@/types/user'
import {
  ASSIGNABLE_ROLES,
  USERS_MANAGE_DENIED,
  canManageClinicTeam,
  canManageUsers,
  normalizeRole,
  type CanonicalRole,
} from '@/utils/permissions'
import { generateId } from '@/utils/crypto'
import { getSessionExpiryDate, hashPassword, isSessionExpired, verifyPassword } from '@/utils/authCrypto'
import { getEffectiveRole, getStoredApiAuth, mapApiUserToAuthUser } from '@/services/apiAuthService'
import { validateProfessionalDocumentNumber } from '@/utils/professionalDocument'
import { seatLimitForAccount, planDisplayName } from '../../shared/subscriptionPlans.js'
import {
  attachRosterToOwner,
  documentDigits,
  resolveAccountOwnerId,
  textId,
} from '../../shared/clinicOwnership.js'
import {
  createClinicMember,
  deleteClinicMember,
  fetchClinicUsers,
  resetClinicMemberPassword,
  updateClinicMember,
  type ClinicSeatSnapshot,
} from '@/services/subscriptionService'

export async function getStoredSessionToken(): Promise<string | null> {
  return localStorage.getItem(SESSION_STORAGE_KEY)
}

export function setStoredSessionToken(token: string | null): void {
  if (token) {
    localStorage.setItem(SESSION_STORAGE_KEY, token)
  } else {
    localStorage.removeItem(SESSION_STORAGE_KEY)
  }
}

export async function createUserCredentials(
  userId: string,
  passwordHash: string,
  passwordSalt: string,
): Promise<void> {
  const now = new Date().toISOString()
  await db.userCredentials.put({
    userId,
    passwordHash,
    passwordSalt,
    updatedAt: now,
  })
}

export async function authenticateUser(
  identifier: string,
  password: string,
): Promise<{ user: UserProfile; session: AuthSession } | null> {
  const raw = identifier.trim()
  const isEmail = raw.includes('@')
  const normalizedEmail = isEmail ? raw.toLowerCase() : ''
  const documentNumber = isEmail ? '' : raw.replace(/\D/g, '')

  let user: UserProfile | undefined
  if (documentNumber.length >= 6) {
    user = await db.users.where('documentNumber').equals(documentNumber).first()
    if (!user) {
      const all = await db.users.toArray()
      user = all.find((item) => String(item.documentNumber ?? '').replace(/\D/g, '') === documentNumber)
    }
  }
  if (!user && normalizedEmail) {
    user = await db.users.where('email').equals(normalizedEmail).first()
  }
  if (!user) return null

  if (user.accessEnabled === false) return null

  const credentials = await db.userCredentials.get(user.id)
  if (!credentials) return null

  const valid = await verifyPassword(password, credentials.passwordHash, credentials.passwordSalt)
  if (!valid) return null

  const session: AuthSession = {
    id: generateId(),
    userId: user.id,
    createdAt: new Date().toISOString(),
    expiresAt: getSessionExpiryDate(SESSION_DURATION_MS),
    userAgent: navigator.userAgent,
  }

  await db.sessions.put(session)
  setStoredSessionToken(session.id)
  return { user, session }
}

export async function resolveAuthUser(sessionToken: string | null) {
  if (!sessionToken) return null

  const session = await db.sessions.get(sessionToken)
  if (!session || isSessionExpired(session.expiresAt)) {
    if (session) await db.sessions.delete(sessionToken)
    setStoredSessionToken(null)
    return null
  }

  const user = await db.users.get(session.userId)
  if (!user) {
    await db.sessions.delete(sessionToken)
    setStoredSessionToken(null)
    return null
  }

  return { ...user, sessionId: session.id }
}

export async function logoutSession(sessionToken: string | null): Promise<void> {
  if (sessionToken) {
    await db.sessions.delete(sessionToken)
  }
  setStoredSessionToken(null)
}

export async function refreshSession(sessionId: string): Promise<void> {
  await db.sessions.update(sessionId, {
    expiresAt: getSessionExpiryDate(SESSION_DURATION_MS),
  })
}

export async function confirmUserPassword(
  userId: string,
  password: string,
): Promise<boolean> {
  const credentials = await db.userCredentials.get(userId)
  if (!credentials) return false
  return verifyPassword(password, credentials.passwordHash, credentials.passwordSalt)
}

export async function changeUserPassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const credentials = await db.userCredentials.get(userId)
  if (!credentials) {
    return { ok: false, error: 'No hay credenciales configuradas para este usuario.' }
  }

  const valid = await verifyPassword(
    currentPassword,
    credentials.passwordHash,
    credentials.passwordSalt,
  )
  if (!valid) {
    return { ok: false, error: 'La contraseña actual no es correcta.' }
  }

  if (newPassword.length < 8) {
    return { ok: false, error: 'La nueva contraseña debe tener al menos 8 caracteres.' }
  }

  const strengthError = validatePasswordStrength(newPassword)
  if (strengthError) return { ok: false, error: strengthError }

  const { hash, salt } = await hashPassword(newPassword)
  await createUserCredentials(userId, hash, salt)
  return { ok: true }
}

export async function seedUserCredentials(userId: string, password: string): Promise<void> {
  const { hash, salt } = await hashPassword(password)
  await createUserCredentials(userId, hash, salt)
}

export function validatePasswordStrength(password: string): string | null {
  if (password.length < 8) {
    return 'La contraseña debe tener al menos 8 caracteres.'
  }
  return null
}

function currentClinicScope() {
  const apiAuth = getStoredApiAuth()
  const apiUser = apiAuth?.user
  return {
    apiAuth,
    clinicId: apiUser?.clinicId || apiUser?.id || '',
    isSuperAdmin: Boolean(apiUser && (apiUser.rol === 'superadmin' || isApiSuperAdminSafe(apiUser))),
  }
}

function isApiSuperAdminSafe(user: { email?: string; rol?: string; estado_pago?: string } | null | undefined) {
  if (!user) return false
  return (
    String(user.rol ?? '').toLowerCase() === 'superadmin' ||
    String(user.email ?? '').toLowerCase() === 'doctormauriciosoto@gmail.com'
  )
}

function actorFromStores(
  localUser: UserProfile | null | undefined,
): {
  role: CanonicalRole | null
  isClinicOwner: boolean
  id?: string
  clinicId?: string
} {
  const apiAuth = getStoredApiAuth()
  const mapped = apiAuth?.user ? mapApiUserToAuthUser(apiAuth.user, '') : null
  const id = localUser?.id || mapped?.id || apiAuth?.user?.id
  const clinicId = localUser?.clinicId || mapped?.clinicId || apiAuth?.user?.clinicId || id
  return {
    role: getEffectiveRole(localUser?.role ?? apiAuth?.user?.rol ?? null),
    isClinicOwner:
      localUser?.isClinicOwner === true ||
      mapped?.isClinicOwner === true ||
      Boolean(id && clinicId && String(id) === String(clinicId)),
    id,
    clinicId,
  }
}

async function requireUserManager(): Promise<
  { ok: true; actorRole: CanonicalRole } | { ok: false; error: string }
> {
  const token = await getStoredSessionToken()
  const localUser = await resolveAuthUser(token)
  const actor = actorFromStores(localUser)
  if (!canManageClinicTeam(actor)) {
    return { ok: false, error: USERS_MANAGE_DENIED }
  }
  return { ok: true, actorRole: actor.role ?? 'admin' }
}

function localSeatError(used: number, max: number | null, planName: string): string | null {
  if (max == null) return null
  if (used >= max) {
    return `Su plan ${planName} permite máximo ${max} colaboradores. Actualmente tiene ${used}. Mejore el plan para agregar más usuarios.`
  }
  return null
}

function staffPhoneDigits(value: string | undefined): string {
  return String(value ?? '').replace(/\D/g, '').slice(0, 12)
}

function isLikelyEmail(value: string | undefined): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value ?? '').trim())
}

function sanitizeAssignableRole(
  role: UserRole | string | undefined,
  actorRole: CanonicalRole,
): { ok: true; role: UserRole } | { ok: false; error: string } {
  const requested = normalizeRole(role)
  if (requested === 'superadmin') {
    if (actorRole !== 'superadmin') {
      return { ok: false, error: 'Solo el superadministrador puede asignar ese rol.' }
    }
    return { ok: true, role: 'superadmin' }
  }
  if (!ASSIGNABLE_ROLES.includes(requested)) {
    return { ok: false, error: 'El rol indicado no está permitido.' }
  }
  return { ok: true, role: requested }
}

async function ensureRemainingUserManager(excludeUserId?: string): Promise<string | null> {
  const { clinicId } = currentClinicScope()
  const allUsers = await db.users.toArray()
  const remaining = allUsers.filter((user) => {
    if (user.id === excludeUserId) return false
    if (clinicId && String(user.clinicId || user.id) !== String(clinicId)) return false
    return user.isClinicOwner === true || canManageUsers(user.role)
  })
  if (remaining.length > 0) return null
  return 'Debe existir el titular administrador de esta clínica.'
}

function sessionMember(): UserProfile | null {
  const apiUser = getStoredApiAuth()?.user
  if (!apiUser?.id) return null
  const mapped = mapApiUserToAuthUser(apiUser, '')
  const { sessionId: _sessionId, ...profile } = mapped
  void _sessionId
  return profile
}

function sortRoster(users: UserProfile[]): UserProfile[] {
  return [...users].sort((a, b) => {
    const left = `${a.lastName} ${a.firstName}`.toLowerCase()
    const right = `${b.lastName} ${b.firstName}`.toLowerCase()
    return left.localeCompare(right, 'es')
  })
}

function serverDoesNotHaveUser(result: { status?: number; error?: string }): boolean {
  return result.status === 404 || /no encontrado/i.test(result.error || '')
}

/**
 * Una sola cuenta en esta pantalla: el titular es quien inició sesión si ya es
 * titular, y el resto (incluido el administrador demo) queda como colaborador.
 */
export async function loadClinicTeam(): Promise<{ users: UserProfile[]; seats: ClinicSeatSnapshot | null }> {
  const gate = await requireUserManager()
  if (!gate.ok) return { users: [], seats: null }

  let api: Awaited<ReturnType<typeof fetchClinicUsers>>
  try {
    api = await fetchClinicUsers()
  } catch (error) {
    console.error(error)
    api = { ok: false, status: 0, error: 'No se pudo listar el equipo de la clínica.' }
  }

  const local = await db.users.toArray()
  const session = sessionMember()
  const byId = new Map<string, UserProfile>()
  for (const user of local) {
    const id = textId(user.id)
    if (id) byId.set(id, user)
  }
  if (api.ok) {
    for (const user of api.users) {
      const id = textId(user.id)
      if (!id) continue
      const previous = byId.get(id)
      byId.set(id, previous ? { ...previous, ...user, id } : { ...user, id })
    }
  }

  let combined = [...byId.values()]
  let ownerId = resolveAccountOwnerId(combined, session)
  if (
    ownerId &&
    session &&
    textId(session.id) === ownerId &&
    !combined.some((user) => textId(user.id) === ownerId)
  ) {
    combined = [...combined, session]
  }
  if (!ownerId && session) ownerId = textId(session.id)

  const roster = combined.map((user) => ({ ...user }))
  if (ownerId) attachRosterToOwner(roster, ownerId)

  for (const user of roster) {
    const previous = local.find((item) => textId(item.id) === textId(user.id))
    try {
      if (!previous) {
        await db.users.put(user)
        continue
      }
      if (
        previous.isClinicOwner !== user.isClinicOwner ||
        textId(previous.clinicId) !== textId(user.clinicId)
      ) {
        await db.users.update(user.id, {
          isClinicOwner: user.isClinicOwner,
          clinicId: user.clinicId,
        })
      }
    } catch (error) {
      console.error(error)
    }
  }

  return {
    users: sortRoster(roster),
    seats: api.ok ? api.seats ?? null : null,
  }
}

export async function listAppUsers(): Promise<UserProfile[]> {
  const team = await loadClinicTeam()
  return team.users
}

async function revokeLocalAccess(userId: string, ownerId: string): Promise<void> {
  const all = await db.users.toArray()
  const target = all.find((user) => textId(user.id) === textId(userId))
  const doc = documentDigits(target?.documentNumber)
  const ids = new Set<string>()
  if (textId(userId)) ids.add(textId(userId))
  if (doc) {
    for (const user of all) {
      if (documentDigits(user.documentNumber) === doc) ids.add(textId(user.id))
    }
  }
  for (const id of ids) {
    if (!id || id === textId(ownerId)) continue
    await db.userCredentials.delete(id)
    const sessions = await db.sessions.where('userId').equals(id).toArray()
    await Promise.all(sessions.map((session) => db.sessions.delete(session.id)))
    const row = await db.users.get(id)
    if (row) {
      await db.users.update(id, { accessEnabled: false, isClinicOwner: false })
    }
  }
}

export async function createAppUser(
  data: Omit<UserProfile, 'id'> & { id?: string },
  password: string,
): Promise<{ ok: true; user: UserProfile } | { ok: false; error: string }> {
  const gate = await requireUserManager()
  if (!gate.ok) return gate

  const passwordError = validatePasswordStrength(password)
  if (passwordError) return { ok: false, error: passwordError }

  const email = String(data.email ?? '').trim().toLowerCase()
  const documentCheck = validateProfessionalDocumentNumber(data.documentNumber)
  if (!documentCheck.valid) {
    return { ok: false, error: documentCheck.message ?? 'La cédula es obligatoria (6 a 12 dígitos).' }
  }
  const documentNumber = documentCheck.normalized ?? data.documentNumber.trim()

  const roleResult = sanitizeAssignableRole(data.role, gate.actorRole)
  if (!roleResult.ok) return roleResult

  const isAuxiliar = roleResult.role === 'recepcion'
  let firstName = String(data.firstName ?? '').trim()
  let lastName = String(data.lastName ?? '').trim()
  const phone = staffPhoneDigits(data.phone)
  if (isAuxiliar) {
    if (!isLikelyEmail(email)) {
      return { ok: false, error: 'El correo electrónico es obligatorio para auxiliares.' }
    }
    if (phone.length < 7 || phone.length > 12) {
      return { ok: false, error: 'El teléfono es obligatorio para auxiliares (7 a 12 dígitos).' }
    }
    if (!firstName) firstName = 'Auxiliar'
    if (!lastName) lastName = 'Administrativo'
  } else if (!firstName || !lastName) {
    return { ok: false, error: 'Nombres y apellidos son obligatorios.' }
  }

  const api = await createClinicMember({
    firstName,
    lastName,
    email,
    phone,
    documentType: data.documentType || 'CC',
    documentNumber,
    rol: roleResult.role,
    role: roleResult.role,
    rethusNumber: isAuxiliar ? '' : data.rethusNumber?.trim() || '',
    thsSpecialty: data.thsSpecialty,
    password,
  })
  if (api.ok) {
    await db.users.put(api.user)
    await seedUserCredentials(api.user.id, password)
    return { ok: true, user: api.user }
  }
  if (getStoredApiAuth()?.token) {
    return { ok: false, error: api.error }
  }

  if (email) {
    const existingEmail = await db.users.where('email').equals(email).first()
    if (existingEmail) return { ok: false, error: 'Ya existe un usuario con este correo.' }
  }
  const allUsers = await db.users.toArray()
  const duplicateDoc = allUsers.find(
    (item) => String(item.documentNumber ?? '').replace(/\D/g, '') === documentNumber,
  )
  if (duplicateDoc) return { ok: false, error: 'Ya existe un usuario con esta cédula.' }

  const { clinicId, apiAuth } = currentClinicScope()
  const members = clinicId
    ? allUsers.filter((item) => String(item.clinicId || item.id) === String(clinicId))
    : allUsers
  const maxSeats = seatLimitForAccount(apiAuth?.user ?? {})
  const seatError = localSeatError(
    members.length,
    maxSeats,
    planDisplayName(apiAuth?.user?.plan, apiAuth?.user?.estado_pago),
  )
  if (seatError) return { ok: false, error: seatError }

  const user: UserProfile = {
    id: data.id ?? generateId(),
    email,
    firstName,
    lastName,
    documentType: data.documentType,
    documentNumber,
    role: roleResult.role,
    clinicName: data.clinicName?.trim() || apiAuth?.user?.clinicName || '',
    legalName: data.legalName?.trim() || data.clinicName?.trim() || apiAuth?.user?.legalName || '',
    providerType: data.providerType ?? 'profesional_independiente',
    providerNit: data.providerNit?.trim() || apiAuth?.user?.providerNit || undefined,
    repsCode: data.repsCode?.trim() || apiAuth?.user?.repsCode || undefined,
    repsStatus: data.repsStatus ?? 'activo',
    rethusNumber: isAuxiliar ? undefined : data.rethusNumber?.trim() || undefined,
    rethusStatus: data.rethusStatus ?? 'activo',
    thsSpecialty: data.thsSpecialty,
    rehusSpecialty: data.rehusSpecialty ?? data.thsSpecialty,
    repsEnabledSpecialties: data.repsEnabledSpecialties,
    avatarUrl: data.avatarUrl,
    phone: phone || undefined,
    clinicId: clinicId || undefined,
    isClinicOwner: false,
  }

  await db.users.add(user)
  await seedUserCredentials(user.id, password)
  return { ok: true, user }
}

export async function updateAppUser(
  userId: string,
  patch: Partial<UserProfile>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const gate = await requireUserManager()
  if (!gate.ok) return gate

  const current = await db.users.get(userId)
  const nextPatch: Partial<UserProfile> = { ...patch }

  if (nextPatch.role !== undefined) {
    const clinicUsers = await db.users.toArray()
    const ownerId = resolveAccountOwnerId(clinicUsers, sessionMember() || currentUserScope())
    if (current && textId(current.id) === ownerId) {
      nextPatch.role = 'admin'
    } else {
      const roleResult = sanitizeAssignableRole(nextPatch.role, gate.actorRole)
      if (!roleResult.ok) return roleResult
      nextPatch.role = roleResult.role

      if (current && canManageUsers(current.role) && !canManageUsers(roleResult.role)) {
        const remainingError = await ensureRemainingUserManager(userId)
        if (remainingError) return { ok: false, error: remainingError }
      }
    }
  }

  if (nextPatch.email !== undefined) {
    const email = String(nextPatch.email ?? '').trim().toLowerCase()
    if (email) {
      const duplicate = await db.users.where('email').equals(email).first()
      if (duplicate && duplicate.id !== userId) {
        return { ok: false, error: 'Ya existe otro usuario con este correo.' }
      }
    }
    nextPatch.email = email
  }

  if (nextPatch.documentNumber !== undefined) {
    const documentCheck = validateProfessionalDocumentNumber(nextPatch.documentNumber)
    if (!documentCheck.valid) {
      return { ok: false, error: documentCheck.message ?? 'El documento no es válido.' }
    }
    nextPatch.documentNumber = documentCheck.normalized ?? nextPatch.documentNumber.trim()
  }

  const nextRole = nextPatch.role ?? current?.role
  if (nextRole === 'recepcion') {
    const email = String(nextPatch.email ?? current?.email ?? '').trim().toLowerCase()
    const phone = staffPhoneDigits(nextPatch.phone ?? current?.phone)
    if (!isLikelyEmail(email)) {
      return { ok: false, error: 'El correo electrónico es obligatorio para auxiliares.' }
    }
    if (phone.length < 7 || phone.length > 12) {
      return { ok: false, error: 'El teléfono es obligatorio para auxiliares (7 a 12 dígitos).' }
    }
    nextPatch.email = email
    nextPatch.phone = phone
  } else if (nextPatch.phone !== undefined) {
    nextPatch.phone = staffPhoneDigits(nextPatch.phone)
  }

  const api = await updateClinicMember(userId, {
    firstName: nextPatch.firstName,
    lastName: nextPatch.lastName,
    email: nextPatch.email,
    phone: nextPatch.phone,
    documentType: nextPatch.documentType,
    documentNumber: nextPatch.documentNumber,
    rol: nextPatch.role,
    role: nextPatch.role,
    rethusNumber: nextPatch.rethusNumber,
    thsSpecialty: nextPatch.thsSpecialty,
    lookupDocumentNumber: current?.documentNumber,
  })
  if (api.ok) {
    await db.users.put(api.user)
    return { ok: true }
  }
  const localEditable = !getStoredApiAuth()?.token || serverDoesNotHaveUser(api)
  if (!localEditable) {
    return { ok: false, error: api.error }
  }
  if (!current) return { ok: false, error: api.error || 'Usuario no encontrado.' }

  await db.users.update(userId, nextPatch)
  return { ok: true }
}

export async function resetAppUserPassword(
  userId: string,
  newPassword: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const gate = await requireUserManager()
  if (!gate.ok) return gate

  const passwordError = validatePasswordStrength(newPassword)
  if (passwordError) return { ok: false, error: passwordError }

  const existing = await db.users.get(userId)
  const api = await resetClinicMemberPassword(userId, newPassword, existing?.documentNumber)
  if (api.ok) {
    try {
      await seedUserCredentials(userId, newPassword)
      await db.users.update(userId, { accessEnabled: true })
    } catch (error) {
      console.error('La clave quedó guardada en el servidor:', error)
    }
    return { ok: true }
  }
  const localOnly = !getStoredApiAuth()?.token || serverDoesNotHaveUser(api)
  if (!localOnly) {
    return { ok: false, error: api.error }
  }

  const user = existing || (await db.users.get(userId))
  if (!user) return { ok: false, error: api.error || 'Usuario no encontrado.' }

  try {
    await seedUserCredentials(userId, newPassword)
    await db.users.update(userId, { accessEnabled: true })
  } catch (error) {
    console.error(error)
    return { ok: false, error: 'No se pudo asignar la contraseña.' }
  }
  return { ok: true }
}

function currentUserScope(): { id?: string; clinicId?: string; email?: string; documentNumber?: string } {
  const scope = currentClinicScope()
  return {
    id: scope.apiAuth?.user?.id,
    clinicId: scope.clinicId,
    email: scope.apiAuth?.user?.email,
    documentNumber: scope.apiAuth?.user?.documentNumber,
  }
}

export async function deleteAppUser(
  userId: string,
  actingUserId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const gate = await requireUserManager()
  if (!gate.ok) return gate

  if (textId(userId) && textId(userId) === textId(actingUserId)) {
    return { ok: false, error: 'No puede eliminar su propio usuario.' }
  }

  const clinicUsers = await db.users.toArray()
  const user =
    clinicUsers.find((item) => textId(item.id) === textId(userId)) ||
    (await db.users.get(userId))
  const ownerId = resolveAccountOwnerId(clinicUsers, sessionMember() || currentUserScope())
  if (user && textId(user.id) === textId(ownerId)) {
    return { ok: false, error: 'No puede eliminar al titular de la clínica.' }
  }

  let api: { ok: true } | { ok: false; status?: number; error: string }
  try {
    api = await deleteClinicMember(userId, user?.documentNumber)
  } catch (error) {
    console.error(error)
    api = { ok: false, status: 0, error: 'No se pudo eliminar el colaborador.' }
  }
  if (api.ok) {
    await revokeLocalAccess(user?.id || userId, ownerId)
    return { ok: true }
  }

  if (!user) {
    return { ok: false, error: api.error || 'Usuario no encontrado.' }
  }
  if (getStoredApiAuth()?.token && !serverDoesNotHaveUser(api)) {
    return { ok: false, error: api.error }
  }

  await revokeLocalAccess(user.id, ownerId)
  return { ok: true }
}

export async function adminSetUserPassword(
  userId: string,
  newPassword: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  return resetAppUserPassword(userId, newPassword)
}
