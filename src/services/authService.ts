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
  createClinicMember,
  deleteClinicMember,
  fetchClinicUsers,
  resetClinicMemberPassword,
  updateClinicMember,
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
  const allUsers = await db.users.toArray()
  const remaining = allUsers.filter(
    (user) => user.id !== excludeUserId && canManageUsers(user.role),
  )
  if (remaining.length > 0) return null
  return 'Debe existir al menos un administrador o superadministrador en el sistema.'
}

export async function listAppUsers(): Promise<UserProfile[]> {
  const gate = await requireUserManager()
  if (!gate.ok) return []
  const api = await fetchClinicUsers()
  if (api.ok) {
    for (const user of api.users) {
      await db.users.put(user)
    }
    return api.users
  }
  const { clinicId, isSuperAdmin } = currentClinicScope()
  const all = await db.users.toArray()
  const scoped = isSuperAdmin || !clinicId
    ? all
    : all.filter((user) => String(user.clinicId || user.id) === String(clinicId))
  return scoped.sort((a, b) => {
    const left = `${a.lastName} ${a.firstName}`.toLowerCase()
    const right = `${b.lastName} ${b.firstName}`.toLowerCase()
    return left.localeCompare(right, 'es')
  })
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
  const firstName = data.firstName.trim()
  const lastName = data.lastName.trim()
  if (!firstName || !lastName) {
    return { ok: false, error: 'Nombres y apellidos son obligatorios.' }
  }

  const documentCheck = validateProfessionalDocumentNumber(data.documentNumber)
  if (!documentCheck.valid) {
    return { ok: false, error: documentCheck.message ?? 'La cédula es obligatoria (6 a 12 dígitos).' }
  }
  const documentNumber = documentCheck.normalized ?? data.documentNumber.trim()

  const roleResult = sanitizeAssignableRole(data.role, gate.actorRole)
  if (!roleResult.ok) return roleResult

  const api = await createClinicMember({
    firstName,
    lastName,
    email,
    documentType: data.documentType || 'CC',
    documentNumber,
    rol: roleResult.role,
    role: roleResult.role,
    rethusNumber: data.rethusNumber?.trim() || '',
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
    rethusNumber: data.rethusNumber?.trim() || undefined,
    rethusStatus: data.rethusStatus ?? 'activo',
    thsSpecialty: data.thsSpecialty,
    rehusSpecialty: data.rehusSpecialty ?? data.thsSpecialty,
    repsEnabledSpecialties: data.repsEnabledSpecialties,
    avatarUrl: data.avatarUrl,
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
    const roleResult = sanitizeAssignableRole(nextPatch.role, gate.actorRole)
    if (!roleResult.ok) return roleResult
    nextPatch.role = roleResult.role

    if (current && canManageUsers(current.role) && !canManageUsers(roleResult.role)) {
      const remainingError = await ensureRemainingUserManager(userId)
      if (remainingError) return { ok: false, error: remainingError }
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

  const api = await updateClinicMember(userId, {
    firstName: nextPatch.firstName,
    lastName: nextPatch.lastName,
    email: nextPatch.email,
    documentType: nextPatch.documentType,
    documentNumber: nextPatch.documentNumber,
    rol: nextPatch.role,
    role: nextPatch.role,
    rethusNumber: nextPatch.rethusNumber,
    thsSpecialty: nextPatch.thsSpecialty,
  })
  if (api.ok) {
    await db.users.put(api.user)
    return { ok: true }
  }
  if (getStoredApiAuth()?.token) {
    return { ok: false, error: api.error }
  }
  if (!current) return { ok: false, error: 'Usuario no encontrado.' }

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

  const api = await resetClinicMemberPassword(userId, newPassword)
  if (api.ok) {
    await seedUserCredentials(userId, newPassword)
    return { ok: true }
  }
  if (getStoredApiAuth()?.token) {
    return { ok: false, error: api.error }
  }

  const user = await db.users.get(userId)
  if (!user) return { ok: false, error: 'Usuario no encontrado.' }

  await seedUserCredentials(userId, newPassword)
  return { ok: true }
}

export async function deleteAppUser(
  userId: string,
  actingUserId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const gate = await requireUserManager()
  if (!gate.ok) return gate

  if (userId === actingUserId) {
    return { ok: false, error: 'No puede eliminar su propio usuario.' }
  }

  const api = await deleteClinicMember(userId)
  if (api.ok) {
    await db.userCredentials.delete(userId)
    const sessions = await db.sessions.where('userId').equals(userId).toArray()
    await Promise.all(sessions.map((s) => db.sessions.delete(s.id)))
    await db.users.delete(userId)
    return { ok: true }
  }
  if (getStoredApiAuth()?.token) {
    return { ok: false, error: api.error }
  }

  const user = await db.users.get(userId)
  if (!user) return { ok: false, error: 'Usuario no encontrado.' }

  if (canManageUsers(user.role)) {
    const remainingError = await ensureRemainingUserManager(userId)
    if (remainingError) return { ok: false, error: remainingError }
  }

  await db.userCredentials.delete(userId)
  const sessions = await db.sessions.where('userId').equals(userId).toArray()
  await Promise.all(sessions.map((s) => db.sessions.delete(s.id)))
  await db.users.delete(userId)
  return { ok: true }
}

export async function adminSetUserPassword(
  userId: string,
  newPassword: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  return resetAppUserPassword(userId, newPassword)
}
