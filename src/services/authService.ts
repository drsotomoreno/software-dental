import { db } from '@/db/database'
import type { AuthSession } from '@/types/auth'
import { SESSION_DURATION_MS, SESSION_STORAGE_KEY } from '@/types/auth'
import type { UserProfile, UserRole } from '@/types/user'
import {
  ASSIGNABLE_ROLES,
  USERS_MANAGE_DENIED,
  canManageUsers,
  normalizeRole,
  type CanonicalRole,
} from '@/utils/permissions'
import { generateId } from '@/utils/crypto'
import { getSessionExpiryDate, hashPassword, isSessionExpired, verifyPassword } from '@/utils/authCrypto'
import { getEffectiveRole, getStoredApiAuth } from '@/services/apiAuthService'
import { validateProfessionalDocumentNumber } from '@/utils/professionalDocument'

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
  email: string,
  password: string,
): Promise<{ user: UserProfile; session: AuthSession } | null> {
  const normalizedEmail = email.trim().toLowerCase()
  const user = await db.users.where('email').equals(normalizedEmail).first()
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

async function resolveActingRole(): Promise<CanonicalRole | null> {
  const token = await getStoredSessionToken()
  const localUser = await resolveAuthUser(token)
  const apiAuth = getStoredApiAuth()
  return getEffectiveRole(localUser?.role ?? apiAuth?.user?.rol ?? null)
}

async function requireUserManager(): Promise<
  { ok: true; actorRole: CanonicalRole } | { ok: false; error: string }
> {
  const actorRole = await resolveActingRole()
  if (!canManageUsers(actorRole)) {
    return { ok: false, error: USERS_MANAGE_DENIED }
  }
  return { ok: true, actorRole: actorRole! }
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
  return db.users.orderBy('email').toArray()
}

export async function createAppUser(
  data: Omit<UserProfile, 'id'> & { id?: string },
  password: string,
): Promise<{ ok: true; user: UserProfile } | { ok: false; error: string }> {
  const gate = await requireUserManager()
  if (!gate.ok) return gate

  const passwordError = validatePasswordStrength(password)
  if (passwordError) return { ok: false, error: passwordError }

  const email = data.email.trim().toLowerCase()
  if (!email) return { ok: false, error: 'El correo es obligatorio.' }

  const existing = await db.users.where('email').equals(email).first()
  if (existing) return { ok: false, error: 'Ya existe un usuario con este correo.' }

  const roleResult = sanitizeAssignableRole(data.role, gate.actorRole)
  if (!roleResult.ok) return roleResult

  const user: UserProfile = {
    id: data.id ?? generateId(),
    email,
    firstName: data.firstName.trim(),
    lastName: data.lastName.trim(),
    documentType: data.documentType,
    documentNumber: data.documentNumber.trim(),
    role: roleResult.role,
    clinicName: data.clinicName.trim(),
    legalName: data.legalName?.trim() || data.clinicName.trim(),
    providerType: data.providerType ?? 'profesional_independiente',
    providerNit: data.providerNit?.trim() || undefined,
    repsCode: data.repsCode?.trim() || undefined,
    repsStatus: data.repsStatus ?? 'activo',
    rethusNumber: data.rethusNumber?.trim() || undefined,
    rethusStatus: data.rethusStatus ?? 'activo',
    thsSpecialty: data.thsSpecialty,
    rehusSpecialty: data.rehusSpecialty ?? data.thsSpecialty,
    repsEnabledSpecialties: data.repsEnabledSpecialties,
    avatarUrl: data.avatarUrl,
  }

  if (!user.firstName || !user.lastName) {
    return { ok: false, error: 'Nombres y apellidos son obligatorios.' }
  }
  if (!user.documentNumber) {
    return { ok: false, error: 'El documento es obligatorio.' }
  }
  const documentCheck = validateProfessionalDocumentNumber(user.documentNumber)
  if (!documentCheck.valid) {
    return { ok: false, error: documentCheck.message ?? 'El documento no es válido.' }
  }
  user.documentNumber = documentCheck.normalized ?? user.documentNumber
  if (!user.clinicName) {
    return { ok: false, error: 'El nombre de la clínica es obligatorio.' }
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
  if (!current) return { ok: false, error: 'Usuario no encontrado.' }

  const nextPatch: Partial<UserProfile> = { ...patch }

  if (nextPatch.role !== undefined) {
    const roleResult = sanitizeAssignableRole(nextPatch.role, gate.actorRole)
    if (!roleResult.ok) return roleResult
    nextPatch.role = roleResult.role

    if (canManageUsers(current.role) && !canManageUsers(roleResult.role)) {
      const remainingError = await ensureRemainingUserManager(userId)
      if (remainingError) return { ok: false, error: remainingError }
    }
  }

  if (nextPatch.email) {
    const email = nextPatch.email.trim().toLowerCase()
    const duplicate = await db.users.where('email').equals(email).first()
    if (duplicate && duplicate.id !== userId) {
      return { ok: false, error: 'Ya existe otro usuario con este correo.' }
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

  await db.users.update(userId, nextPatch)
  return { ok: true }
}

export async function resetAppUserPassword(
  userId: string,
  newPassword: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const gate = await requireUserManager()
  if (!gate.ok) return gate

  const user = await db.users.get(userId)
  if (!user) return { ok: false, error: 'Usuario no encontrado.' }

  const passwordError = validatePasswordStrength(newPassword)
  if (passwordError) return { ok: false, error: passwordError }

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
