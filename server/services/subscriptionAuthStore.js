import { createHash, randomBytes, randomUUID } from 'node:crypto'

import { join } from 'node:path'

import { config } from '../config.js'
import { claimRethusForUser } from './rethusRegistry.js'
import { verifyAndClaimPrestador } from './prestadorRegistry.js'
import { PAID_PLAN_IDS, PAID_PLAN_DAYS, TRIAL_DAYS } from '../../shared/subscriptionPlans.js'
import { readDurableJson, writeDurableJson } from './durableStore.js'
import { splitPersonName, composeLegalName } from '../../shared/personName.js'
import { formatNitInput } from '../../shared/nit.js'
import { sanitizeRepsInput } from '../../shared/prestadorIdentity.js'
import { isInstitutionProvider, normalizeProviderType } from '../../shared/providerType.js'



const USERS_FILE = join(config.dataDir, 'subscription-users.json')

const VALID_ROLES = new Set(['superadmin', 'admin', 'odontologo', 'recepcion'])

export const SUPERADMIN_EMAIL = config.superAdmin.email
export const MASTER_EMAIL = 'doctormauriciosoto@gmail.com'
export const MASTER_PASSWORD = 'Dragon1976%'

export function isMasterCredentials(email, password) {
  if (normalizeEmail(email) !== MASTER_EMAIL) return false
  const pwd = String(password)
  return pwd === MASTER_PASSWORD || hashPasswordSha256(pwd) === hashPasswordSha256(MASTER_PASSWORD)
}



function emptyStore() {
  return { users: [], sessions: [], passwordResets: [], emailVerifications: [] }
}



export function hashPasswordSha256(password) {

  return createHash('sha256').update(String(password)).digest('hex')

}

function passwordVariants(password) {
  const raw = String(password ?? '')
  const trimmed = raw.trim()
  return [...new Set([raw, trimmed].filter(Boolean))]
}

function resolvedPasswordHash(storedHash, password) {
  if (!storedHash) return null
  for (const value of passwordVariants(password)) {
    const hashed = hashPasswordSha256(value)
    if (hashed === storedHash) return hashed
    if (hashPasswordSha256(hashed) === storedHash) return hashed
  }
  return null
}

const SEEDED_CLINIC_USERS = [
  {
    email: 'eliasmauricio@yahoo.com',
    password: 'Soto1976',
    nombre: 'Elian Sotto',
  },
]

function seedClinicUsers(store) {
  let changed = false
  const now = new Date().toISOString()
  for (const seed of SEEDED_CLINIC_USERS) {
    const email = normalizeEmail(seed.email)
    const passwordHash = hashPasswordSha256(seed.password)
    const index = store.users.findIndex((user) => normalizeEmail(user.email) === email)
    if (index === -1) {
      store.users.push({
        id: randomUUID(),
        nombre: seed.nombre,
        email,
        passwordHash,
        rol: 'odontologo',
        estado_pago: 'activo',
        fecha_vencimiento: addDays(new Date(), 30),
        createdAt: now,
        updatedAt: now,
      })
      changed = true
      continue
    }
    const current = store.users[index]
    const passwordOk = Boolean(resolvedPasswordHash(current.passwordHash, seed.password))
    if (passwordOk && isSubscriptionActive(current)) continue
    store.users[index] = {
      ...current,
      nombre: current.nombre || seed.nombre,
      passwordHash: passwordOk ? current.passwordHash : passwordHash,
      estado_pago: 'activo',
      fecha_vencimiento: isSubscriptionActive(current)
        ? current.fecha_vencimiento
        : addDays(new Date(), 30),
      updatedAt: now,
    }
    changed = true
  }
  return changed
}



function normalizeEmail(email) {

  return String(email).trim().toLowerCase()

}



function normalizeRole(rol) {

  const value = String(rol ?? '').trim().toLowerCase()

  if (VALID_ROLES.has(value)) return value

  if (value === 'administrador') return 'admin'

  if (value === 'auxiliar') return 'recepcion'

  return 'odontologo'

}



export function isSuperAdminUser(user) {

  if (!user) return false

  const email = normalizeEmail(user.email ?? '')

  const rol = normalizeRole(user.rol)

  return email === SUPERADMIN_EMAIL || rol === 'superadmin' || user.estado_pago === 'exento'

}



function isPaymentExempt(user) {

  return isSuperAdminUser(user)

}



function stripProfessionalCard(user) {
  if (!user || typeof user !== 'object') return user
  const next = { ...user }
  delete next.professionalLicense
  delete next.tarjetaProfesional
  delete next.tarjeta_profesional
  return next
}

function migrateUser(user) {

  const email = normalizeEmail(user.email ?? '')

  const isSuper = email === SUPERADMIN_EMAIL || normalizeRole(user.rol) === 'superadmin'



  return stripProfessionalCard({

    ...user,

    rol: isSuper ? 'superadmin' : normalizeRole(user.rol),

    estado_pago: isSuper ? 'exento' : user.estado_pago ?? 'pendiente',

  })

}



async function loadStore() {
  const parsed = await readDurableJson(USERS_FILE, emptyStore())
  const users = (Array.isArray(parsed.users) ? parsed.users : []).map(migrateUser)
  const sessions = Array.isArray(parsed.sessions) ? parsed.sessions : []
  const passwordResets = Array.isArray(parsed.passwordResets) ? parsed.passwordResets : []
  const emailVerifications = Array.isArray(parsed.emailVerifications)
    ? parsed.emailVerifications
    : []
  return { users, sessions, passwordResets, emailVerifications }
}

async function saveStore(store) {
  await writeDurableJson(USERS_FILE, store)
}



function addDays(date, days) {

  const next = new Date(date)

  next.setDate(next.getDate() + days)

  return next.toISOString()

}



function isSubscriptionActive(user) {

  if (isPaymentExempt(user)) return true

  if (user.estado_pago !== 'activo' && user.estado_pago !== 'prueba') return false

  if (!user.fecha_vencimiento) return false

  return new Date(user.fecha_vencimiento).getTime() > Date.now()

}



function refreshPaymentStatus(user) {

  if (isPaymentExempt(user)) return user

  if ((user.estado_pago === 'activo' || user.estado_pago === 'prueba') && user.fecha_vencimiento) {

    if (new Date(user.fecha_vencimiento).getTime() <= Date.now()) {

      return { ...user, estado_pago: 'vencido' }

    }

  }

  return user

}



function createSessionForUser(user) {

  const token = randomBytes(32).toString('hex')

  const exempt = isPaymentExempt(user)

  const session = {

    token,

    userId: user.id,

    rol: user.rol ?? 'odontologo',

    createdAt: new Date().toISOString(),

    expiresAt: exempt ? addDays(new Date(), 3650) : addDays(new Date(), 30),

  }

  return { token, session }

}



/** Crea o actualiza la cuenta SuperAdmin por defecto al iniciar el servidor. */

export async function ensureSuperAdmin() {

  const store = await loadStore()

  const email = SUPERADMIN_EMAIL

  const now = new Date().toISOString()

  const passwordHash = hashPasswordSha256(MASTER_PASSWORD)

  const existingIndex = store.users.findIndex((user) => normalizeEmail(user.email) === email)



  if (existingIndex === -1) {

    store.users.push({

      id: randomUUID(),

      nombre: config.superAdmin.nombre,

      email,

      passwordHash,

      rol: 'superadmin',

      estado_pago: 'exento',

      fecha_vencimiento: null,

      createdAt: now,

      updatedAt: now,

    })

  } else {

    const existing = store.users[existingIndex]
    store.users[existingIndex] = {
      ...existing,
      email,
      rol: 'superadmin',
      estado_pago: 'exento',
      passwordHash: existing.passwordHash || passwordHash,
      updatedAt: now,
    }

  }



  seedClinicUsers(store)

  await saveStore(store)

  console.log(`[Auth] SuperAdmin listo: ${email}`)

}



export async function registerSubscriptionUser({ nombre, email, password }) {

  const store = await loadStore()

  const normalizedEmail = normalizeEmail(email)

  const name = String(nombre ?? '').trim()



  if (normalizedEmail === SUPERADMIN_EMAIL) {

    return { ok: false, status: 403, error: 'Este correo está reservado para el administrador del sistema.' }

  }



  if (!name) {

    return { ok: false, status: 400, error: 'El nombre es obligatorio.' }

  }

  if (!normalizedEmail) {

    return { ok: false, status: 400, error: 'El correo es obligatorio.' }

  }

  if (!password || String(password).length < 6) {

    return { ok: false, status: 400, error: 'La contraseña debe tener al menos 6 caracteres.' }

  }



  if (store.users.some((user) => user.email === normalizedEmail)) {

    return { ok: false, status: 409, error: 'Ya existe una cuenta con este correo.' }

  }



  const user = {

    id: randomUUID(),

    nombre: name,

    email: normalizedEmail,

    passwordHash: hashPasswordSha256(password),

    rol: 'odontologo',

    estado_pago: 'pendiente',

    fecha_vencimiento: null,

    createdAt: new Date().toISOString(),

    updatedAt: new Date().toISOString(),

  }



  store.users.push(user)

  await saveStore(store)



  return {

    ok: true,

    user: sanitizeUser(user),

  }

}



export async function loginSubscriptionUser({ email, password }) {
  await ensureSuperAdmin()
  const store = await loadStore()
  const normalizedEmail = normalizeEmail(email)

  if (!normalizedEmail || !password) {
    return { ok: false, status: 400, error: 'Correo y contraseña son obligatorios.' }
  }

  const masterLogin = isMasterCredentials(normalizedEmail, password)

  let userIndex = store.users.findIndex((item) => item.email === normalizedEmail)

  if (masterLogin && userIndex === -1) {
    await ensureSuperAdmin()
    const refreshed = await loadStore()
    userIndex = refreshed.users.findIndex((item) => item.email === normalizedEmail)
    store.users = refreshed.users
    store.sessions = refreshed.sessions
  }

  if (masterLogin && userIndex === -1) {
    const now = new Date().toISOString()
    const masterUser = {
      id: randomUUID(),
      nombre: config.superAdmin.nombre,
      email: MASTER_EMAIL,
      passwordHash: hashPasswordSha256(MASTER_PASSWORD),
      rol: 'superadmin',
      estado_pago: 'exento',
      fecha_vencimiento: null,
      createdAt: now,
      updatedAt: now,
    }
    store.users.push(masterUser)
    userIndex = store.users.length - 1
  }

  if (userIndex === -1) {
    return { ok: false, status: 401, error: 'Correo o contraseña incorrectos.' }
  }

  let currentUser = refreshPaymentStatus(store.users[userIndex])
  store.users[userIndex] = currentUser

  const matchedHash = resolvedPasswordHash(currentUser.passwordHash, password)
  if (!masterLogin && !matchedHash) {
    await saveStore(store)
    return { ok: false, status: 401, error: 'Correo o contraseña incorrectos.' }
  }

  if (!masterLogin && matchedHash && matchedHash !== currentUser.passwordHash) {
    currentUser = { ...currentUser, passwordHash: matchedHash, updatedAt: new Date().toISOString() }
    store.users[userIndex] = currentUser
  }

  if (masterLogin) {
    const masterUser = {
      ...currentUser,
      rol: 'superadmin',
      estado_pago: 'exento',
      updatedAt: new Date().toISOString(),
    }
    store.users[userIndex] = masterUser
    const { token, session } = createSessionForUser(masterUser)
    store.sessions = store.sessions.filter((item) => item.userId !== masterUser.id)
    store.sessions.push(session)
    await saveStore(store)
    return {
      ok: true,
      token,
      user: sanitizeUser(masterUser),
      expiresAt: session.expiresAt,
      unlimitedAccess: true,
    }
  }

  const superAdminAccess =
    normalizedEmail === SUPERADMIN_EMAIL || isPaymentExempt(currentUser)

  const { token, session } = createSessionForUser(currentUser)

  store.sessions = store.sessions.filter((item) => item.userId !== currentUser.id)

  store.sessions.push(session)

  await saveStore(store)

  const active = superAdminAccess || isSubscriptionActive(currentUser)

  return {

    ok: true,

    token,

    user: sanitizeUser(currentUser),

    expiresAt: session.expiresAt,

    unlimitedAccess: isPaymentExempt(currentUser),

    requiresSubscription: !active,

  }

}



export async function confirmSubscriptionPayment({ email, token }) {

  const store = await loadStore()

  let user = null



  if (token) {

    const session = store.sessions.find((item) => item.token === token)

    if (session) {

      user = store.users.find((item) => item.id === session.userId) ?? null

    }

  }



  if (!user && email) {

    user = store.users.find((item) => item.email === normalizeEmail(email)) ?? null

  }



  if (!user) {

    return { ok: false, status: 404, error: 'Usuario no encontrado.' }

  }



  if (isPaymentExempt(user)) {

    return { ok: false, status: 400, error: 'Este usuario no requiere pago de suscripción.' }

  }



  const updatedUser = {

    ...user,

    estado_pago: 'activo',

    fecha_vencimiento: addDays(new Date(), 30),

    updatedAt: new Date().toISOString(),

  }



  store.users = store.users.map((item) => (item.id === user.id ? updatedUser : item))

  await saveStore(store)



  const { token: authToken, session } = createSessionForUser(updatedUser)



  store.sessions = store.sessions.filter((item) => item.userId !== updatedUser.id)

  store.sessions.push(session)

  await saveStore(store)



  return {

    ok: true,

    token: authToken,

    user: sanitizeUser(updatedUser),

    expiresAt: updatedUser.fecha_vencimiento,

  }

}



export async function resolveSubscriptionSession(token) {

  if (!token) return null



  const store = await loadStore()

  const session = store.sessions.find((item) => item.token === token)

  if (!session) return null



  const userIndex = store.users.findIndex((item) => item.id === session.userId)

  if (userIndex === -1) return null



  const user = refreshPaymentStatus(store.users[userIndex])

  store.users[userIndex] = user

  await saveStore(store)



  const exempt = isPaymentExempt(user)



  if (!exempt && new Date(session.expiresAt).getTime() <= Date.now()) {

    store.sessions = store.sessions.filter((item) => item.token !== token)

    await saveStore(store)

    return null

  }



  if (!exempt && !isSubscriptionActive(user)) {

    return {

      user: sanitizeUser(user),

      active: false,

      requiresSubscription: true,

      estado_pago: user.estado_pago,

      token,

      rol: user.rol ?? session.rol ?? 'odontologo',

      expiresAt: exempt ? null : session.expiresAt,

      unlimitedAccess: false,

    }

  }



  return {

    user: sanitizeUser(user),

    active: true,

    token,

    rol: user.rol ?? session.rol ?? 'odontologo',

    expiresAt: exempt ? null : session.expiresAt,

    unlimitedAccess: exempt,

  }

}



export const RESET_TOKEN_TTL_MS = 15 * 60 * 1000

export async function createPasswordResetToken(email) {
  const store = await loadStore()
  const normalizedEmail = normalizeEmail(email)
  const user = store.users.find((item) => item.email === normalizedEmail)

  if (!user) {
    return { ok: true, created: false }
  }

  const token = randomBytes(32).toString('hex')
  const tokenHash = hashPasswordSha256(token)
  const now = Date.now()

  store.passwordResets = (store.passwordResets ?? []).filter(
    (item) => item.userId !== user.id && new Date(item.expiresAt).getTime() > now,
  )
  store.passwordResets.push({
    tokenHash,
    userId: user.id,
    email: user.email,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(now + RESET_TOKEN_TTL_MS).toISOString(),
  })
  await saveStore(store)

  return { ok: true, created: true, token, email: user.email }
}

export async function resetPasswordWithToken({ token, newPassword }) {
  const rawToken = String(token ?? '').trim()
  const password = String(newPassword ?? '')

  if (!rawToken) {
    return { ok: false, status: 400, error: 'El enlace de recuperación no es válido.' }
  }
  if (!password || password.length < 6) {
    return { ok: false, status: 400, error: 'La contraseña debe tener al menos 6 caracteres.' }
  }

  const store = await loadStore()
  const tokenHash = hashPasswordSha256(rawToken)
  const now = Date.now()
  const resetIndex = (store.passwordResets ?? []).findIndex((item) => item.tokenHash === tokenHash)

  if (resetIndex === -1) {
    return { ok: false, status: 400, error: 'El enlace de recuperación no es válido o ya fue usado.' }
  }

  const reset = store.passwordResets[resetIndex]
  if (new Date(reset.expiresAt).getTime() <= now) {
    store.passwordResets.splice(resetIndex, 1)
    await saveStore(store)
    return { ok: false, status: 400, error: 'El enlace de recuperación ha expirado. Solicite uno nuevo.' }
  }

  const userIndex = store.users.findIndex((item) => item.id === reset.userId)
  if (userIndex === -1) {
    store.passwordResets.splice(resetIndex, 1)
    await saveStore(store)
    return { ok: false, status: 400, error: 'El enlace de recuperación no es válido.' }
  }

  store.users[userIndex] = {
    ...store.users[userIndex],
    passwordHash: hashPasswordSha256(password),
    updatedAt: new Date().toISOString(),
  }
  store.sessions = store.sessions.filter((item) => item.userId !== reset.userId)
  store.passwordResets = store.passwordResets.filter((item) => item.userId !== reset.userId)
  await saveStore(store)

  return { ok: true }
}

export const EMAIL_CODE_TTL_MS = 15 * 60 * 1000

function generateNumericCode() {
  const num = randomBytes(3).readUIntBE(0, 3) % 1_000_000
  return String(num).padStart(6, '0')
}

function normalizeOtp(code) {
  return String(code ?? '').replace(/\D/g, '').slice(0, 6)
}

export async function createEmailVerification({ nombre, email, password }) {
  const store = await loadStore()
  const normalizedEmail = normalizeEmail(email)
  const name = String(nombre ?? '').trim()

  if (normalizedEmail === SUPERADMIN_EMAIL) {
    return { ok: false, status: 403, error: 'Este correo está reservado para el administrador del sistema.' }
  }
  if (!name) {
    return { ok: false, status: 400, error: 'El nombre es obligatorio.' }
  }
  if (!normalizedEmail) {
    return { ok: false, status: 400, error: 'El correo es obligatorio.' }
  }
  const passwordValue = String(password ?? '').trim()
  if (!passwordValue || passwordValue.length < 6) {
    return { ok: false, status: 400, error: 'La contraseña debe tener al menos 6 caracteres.' }
  }
  if (store.users.some((user) => user.email === normalizedEmail && user.estado_pago !== 'pendiente')) {
    return { ok: false, status: 409, error: 'Ya existe una cuenta con este correo.' }
  }

  const now = Date.now()
  const pending = (store.emailVerifications ?? []).find(
    (item) =>
      item.email === normalizedEmail &&
      new Date(item.expiresAt).getTime() > now &&
      normalizeOtp(item.code).length === 6,
  )
  const code = pending ? normalizeOtp(pending.code) : generateNumericCode()

  store.emailVerifications = (store.emailVerifications ?? []).filter(
    (item) => item.email !== normalizedEmail && new Date(item.expiresAt).getTime() > now,
  )
  store.emailVerifications.push({
    email: normalizedEmail,
    nombre: name,
    passwordHash: hashPasswordSha256(passwordValue),
    code,
    codeHash: hashPasswordSha256(code),
    createdAt: pending?.createdAt ?? new Date().toISOString(),
    expiresAt: new Date(now + EMAIL_CODE_TTL_MS).toISOString(),
    attempts: 0,
  })
  await saveStore(store)

  return { ok: true, email: normalizedEmail, code }
}

export async function verifyEmailAndRegister({ email, code, password }) {
  const store = await loadStore()
  const normalizedEmail = normalizeEmail(email)
  const rawCode = normalizeOtp(code)
  const now = Date.now()
  const index = (store.emailVerifications ?? []).findIndex((item) => item.email === normalizedEmail)

  if (rawCode.length !== 6) {
    return { ok: false, status: 400, error: 'El código debe tener 6 dígitos, sin espacios.' }
  }

  if (index === -1) {
    return { ok: false, status: 400, error: 'Solicite un código de verificación primero.' }
  }

  const pending = store.emailVerifications[index]
  if (new Date(pending.expiresAt).getTime() <= now) {
    store.emailVerifications.splice(index, 1)
    await saveStore(store)
    return { ok: false, status: 400, error: 'El código expiró. Solicite uno nuevo.' }
  }

  if ((pending.attempts ?? 0) >= 5) {
    store.emailVerifications.splice(index, 1)
    await saveStore(store)
    return { ok: false, status: 400, error: 'Demasiados intentos. Solicite un código nuevo.' }
  }

  const expected = normalizeOtp(pending.code)
  const hashMatches = pending.codeHash === hashPasswordSha256(rawCode)
  const plainMatches = expected.length === 6 && expected === rawCode
  if (!hashMatches && !plainMatches) {
    pending.attempts = (pending.attempts ?? 0) + 1
    store.emailVerifications[index] = pending
    await saveStore(store)
    return { ok: false, status: 400, error: 'El código no es válido. Use el de 6 dígitos del correo más reciente, sin espacios.' }
  }

  const existingIndex = store.users.findIndex((user) => user.email === normalizedEmail)
  const existing = existingIndex === -1 ? null : store.users[existingIndex]
  if (existing && existing.estado_pago !== 'pendiente') {
    store.emailVerifications.splice(index, 1)
    await saveStore(store)
    return { ok: false, status: 409, error: 'Ya existe una cuenta con este correo.' }
  }

  const passwordValue = String(password ?? '').trim()
  const passwordHash =
    passwordValue.length >= 6 ? hashPasswordSha256(passwordValue) : pending.passwordHash
  if (!passwordHash) {
    return { ok: false, status: 400, error: 'No se encontró la contraseña del registro. Solicite un código nuevo.' }
  }

  const createdAt = new Date().toISOString()
  const pendingAccount = {
    estado_pago: 'pendiente',
    fecha_vencimiento: null,
    plan: null,
  }

  if (existing) {
    const updated = {
      ...existing,
      nombre: pending.nombre || existing.nombre,
      passwordHash,
      ...pendingAccount,
      emailVerifiedAt: existing.emailVerifiedAt ?? createdAt,
      updatedAt: createdAt,
    }
    store.users[existingIndex] = updated
    store.emailVerifications.splice(index, 1)
    await saveStore(store)
    return { ok: true, user: sanitizeUser(updated) }
  }

  const user = {
    id: randomUUID(),
    nombre: pending.nombre,
    email: normalizedEmail,
    passwordHash,
    rol: 'odontologo',
    ...pendingAccount,
    emailVerifiedAt: createdAt,
    createdAt,
    updatedAt: createdAt,
  }
  store.users.push(user)
  store.emailVerifications.splice(index, 1)
  await saveStore(store)

  return { ok: true, user: sanitizeUser(user) }
}

function sanitizeUser(user) {
  const trialLimited = user.estado_pago === 'prueba' && isSubscriptionActive(user)
  const names = splitPersonName({
    nombre: user.nombre,
    firstName: user.firstName,
    lastName: user.lastName,
  })
  const firstName = names.firstName
  const lastName = names.lastName
  const legalName = String(user.legalName ?? user.clinicName ?? '').trim()
  const providerType = normalizeProviderType(user.providerType)
  const nombre = isInstitutionProvider(providerType)
    ? legalName || [firstName, lastName].filter(Boolean).join(' ').trim() || String(user.nombre ?? '').trim()
    : [firstName, lastName].filter(Boolean).join(' ').trim() || String(user.nombre ?? '').trim()
  return {
    id: user.id,
    nombre,
    firstName,
    lastName,
    email: user.email,
    rol: isSuperAdminUser(user) ? 'superadmin' : normalizeRole(user.rol),
    estado_pago: isSuperAdminUser(user) ? 'exento' : user.estado_pago,
    fecha_vencimiento: user.fecha_vencimiento,
    plan: isSuperAdminUser(user) ? 'exento' : user.plan ?? null,
    documentType: user.documentType || 'CC',
    documentNumber: user.documentNumber ?? '',
    rethusNumber: user.rethusNumber ?? '',
    rethusStatus: user.rethusStatus ?? (user.rethusNumber ? 'activo' : undefined),
    clinicName: user.clinicName ?? '',
    legalName: user.legalName ?? user.clinicName ?? '',
    providerType: normalizeProviderType(user.providerType),
    providerNit: user.providerNit ?? '',
    repsCode: user.repsCode ?? '',
    repsStatus: user.repsStatus ?? 'activo',
    thsSpecialty: user.thsSpecialty ?? 'odontologia_general',
    rehusSpecialty: user.rehusSpecialty ?? user.thsSpecialty ?? 'odontologia_general',
    repsEnabledSpecialties: Array.isArray(user.repsEnabledSpecialties)
      ? user.repsEnabledSpecialties
      : [user.thsSpecialty ?? 'odontologia_general'],
    trialLimited,
    trialLimits: trialLimited ? { maxPatients: 1, maxVoiceNotesPerField: 1 } : null,
    prestadorVerifiedAt: user.prestadorVerifiedAt ?? null,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  }
}

function normalizeDocumentNumber(value) {
  return String(value ?? '')
    .trim()
    .replace(/\D/g, '')
}

export async function updateSubscriptionProfile({ token, userId, patch }) {
  const session = await resolveSubscriptionSession(token)
  if (!session?.user) {
    return { ok: false, status: 401, error: 'Sesión inválida o expirada.' }
  }

  const actor = session.user
  const targetId = userId && userId !== 'me' ? String(userId) : actor.id
  const isSelf = targetId === actor.id
  const actorRol = String(actor.rol ?? '').toLowerCase()
  const actorEmail = String(actor.email ?? '').toLowerCase()
  const canEditOthers =
    actorEmail === MASTER_EMAIL || actorRol === 'superadmin' || actorRol === 'admin'

  if (!isSelf && !canEditOthers) {
    return { ok: false, status: 403, error: 'No puede editar el perfil de otro usuario.' }
  }

  const store = await loadStore()
  const index = store.users.findIndex((item) => item.id === targetId)
  if (index === -1) {
    return { ok: false, status: 404, error: 'Usuario no encontrado.' }
  }

  const current = store.users[index]
  const targetRole = normalizeRole(current.rol)
  const mustVerifyPrestador = targetRole !== 'recepcion'
  const providerType = normalizeProviderType(patch.providerType ?? current.providerType)
  const institution = isInstitutionProvider(providerType)

  const names = splitPersonName({
    firstName: String(patch.firstName ?? current.firstName ?? '').trim(),
    lastName: String(patch.lastName ?? current.lastName ?? '').trim(),
  })
  const firstName = names.firstName
  const lastName = names.lastName
  if (!firstName || !lastName) {
    return {
      ok: false,
      status: 400,
      error: institution
        ? 'Indique el nombre del representante o responsable de la cuenta.'
        : 'Nombres y apellidos son obligatorios. No use títulos (Dr./Dra.) ni caracteres extraños.',
    }
  }

  const documentType = String(patch.documentType ?? current.documentType ?? 'CC').trim() || 'CC'
  const documentNumber = normalizeDocumentNumber(
    patch.documentNumber ?? current.documentNumber ?? '',
  )
  if (!institution && (!documentNumber || documentNumber.length < 6 || documentNumber.length > 12)) {
    return {
      ok: false,
      status: 400,
      error: 'El número de documento (cédula) es obligatorio, solo dígitos, entre 6 y 12 caracteres.',
    }
  }
  if (documentNumber && (documentNumber.length < 6 || documentNumber.length > 12)) {
    return {
      ok: false,
      status: 400,
      error: 'El número de documento debe tener entre 6 y 12 dígitos.',
    }
  }

  const rethusNumber = String(patch.rethusNumber ?? current.rethusNumber ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
  if (!institution && (mustVerifyPrestador || rethusNumber)) {
    const digits = rethusNumber.replace(/\D/g, '')
    if (digits.length < 6 || digits.length > 12) {
      return {
        ok: false,
        status: 400,
        error: 'El código ReTHUS es obligatorio y debe tener entre 6 y 12 dígitos.',
      }
    }
  }
  if (institution && rethusNumber) {
    const digits = rethusNumber.replace(/\D/g, '')
    if (digits.length < 6 || digits.length > 12) {
      return {
        ok: false,
        status: 400,
        error: 'Si indica ReTHUS, debe tener entre 6 y 12 dígitos.',
      }
    }
  }

  const legalName = String(patch.legalName ?? current.legalName ?? patch.clinicName ?? current.clinicName ?? '')
    .trim()
  const clinicName = String(patch.clinicName ?? current.clinicName ?? legalName).trim()
  const providerNit = formatNitInput(patch.providerNit ?? current.providerNit ?? '')
  const repsCode = sanitizeRepsInput(patch.repsCode ?? current.repsCode ?? '')

  if (institution && !legalName) {
    return { ok: false, status: 400, error: 'La razón social de la IPS es obligatoria.' }
  }

  if (mustVerifyPrestador) {
    const claimed = await verifyAndClaimPrestador({
      userId: current.id,
      providerType,
      firstName,
      lastName,
      legalName: legalName || composeLegalName(firstName, lastName),
      documentType,
      documentNumber,
      rethusNumber,
      repsCode,
      providerNit,
      clinicName: clinicName || legalName,
    })
    if (!claimed.ok) {
      return claimed
    }
  }

  let email = current.email
  if (patch.email !== undefined) {
    const nextEmail = String(patch.email).trim().toLowerCase()
    if (nextEmail && nextEmail !== current.email) {
      const duplicate = store.users.some(
        (item) => item.id !== current.id && normalizeEmail(item.email) === nextEmail,
      )
      if (duplicate) {
        return { ok: false, status: 400, error: 'Ya existe otro usuario con este correo.' }
      }
      email = nextEmail
    }
  }

  const now = new Date().toISOString()
  const updated = stripProfessionalCard({
    ...current,
    firstName,
    lastName,
    nombre: institution
      ? legalName || composeLegalName(firstName, lastName)
      : composeLegalName(firstName, lastName) || current.nombre,
    email,
    documentType,
    documentNumber,
    rethusNumber,
    rethusStatus: patch.rethusStatus ?? current.rethusStatus ?? (rethusNumber ? 'activo' : current.rethusStatus),
    clinicName: clinicName || legalName,
    legalName: legalName || clinicName,
    providerType,
    providerNit,
    repsCode,
    repsStatus: patch.repsStatus ?? current.repsStatus ?? 'activo',
    thsSpecialty: patch.thsSpecialty ?? current.thsSpecialty ?? 'odontologia_general',
    rehusSpecialty:
      patch.rehusSpecialty ?? patch.thsSpecialty ?? current.rehusSpecialty ?? current.thsSpecialty,
    repsEnabledSpecialties: Array.isArray(patch.repsEnabledSpecialties)
      ? patch.repsEnabledSpecialties
      : current.repsEnabledSpecialties,
    prestadorVerifiedAt: mustVerifyPrestador ? now : current.prestadorVerifiedAt,
    updatedAt: now,
  })

  store.users[index] = updated
  await saveStore(store)
  return { ok: true, user: sanitizeUser(updated) }
}

export async function changeOwnPassword({ token, currentPassword, newPassword }) {
  const session = await resolveSubscriptionSession(token)
  if (!session?.user) {
    return { ok: false, status: 401, error: 'Sesión inválida o expirada.' }
  }

  const nextPassword = String(newPassword ?? '')
  if (nextPassword.length < 8) {
    return { ok: false, status: 400, error: 'La nueva contraseña debe tener al menos 8 caracteres.' }
  }

  const store = await loadStore()
  const index = store.users.findIndex((item) => item.id === session.user.id)
  if (index === -1) {
    return { ok: false, status: 404, error: 'Usuario no encontrado.' }
  }

  const current = store.users[index]
  const matchedHash = resolvedPasswordHash(current.passwordHash, currentPassword)
  const masterOk = isMasterCredentials(current.email, currentPassword)
  if (!matchedHash && !masterOk) {
    return { ok: false, status: 400, error: 'La contraseña actual no es correcta.' }
  }

  store.users[index] = {
    ...current,
    passwordHash: hashPasswordSha256(nextPassword),
    updatedAt: new Date().toISOString(),
  }
  await saveStore(store)
  return { ok: true }
}

export async function startRethusTrial({ token, documentNumber, rethusNumber }) {
  const session = await resolveSubscriptionSession(token)
  if (!session?.user) {
    return { ok: false, status: 401, error: 'Sesión inválida o expirada.' }
  }
  if (isPaymentExempt(session.user)) {
    return { ok: false, status: 400, error: 'Esta cuenta no requiere prueba gratuita.' }
  }

  const store = await loadStore()
  const index = store.users.findIndex((item) => item.id === session.user.id)
  if (index === -1) {
    return { ok: false, status: 404, error: 'Usuario no encontrado.' }
  }

  const current = refreshPaymentStatus(store.users[index])
  if (current.estado_pago === 'activo' && isSubscriptionActive(current)) {
    return { ok: false, status: 400, error: 'Ya tiene una suscripción de pago activa.' }
  }
  if (current.estado_pago === 'prueba' && isSubscriptionActive(current)) {
    return { ok: false, status: 400, error: 'Ya tiene una prueba gratuita activa.' }
  }
  if (current.trialUsedAt) {
    return { ok: false, status: 400, error: 'La prueba gratuita ya fue utilizada. Elija un plan de pago.' }
  }

  const claimed = await claimRethusForUser({
    documentNumber,
    rethusNumber,
    userId: current.id,
  })
  if (!claimed.ok) return claimed

  const now = new Date().toISOString()
  const updated = {
    ...current,
    documentNumber: claimed.document,
    rethusNumber: claimed.rethus,
    plan: 'prueba',
    estado_pago: 'prueba',
    fecha_vencimiento: addDays(new Date(), TRIAL_DAYS),
    trialUsedAt: now,
    trialStartedAt: now,
    updatedAt: now,
  }
  store.users[index] = updated
  await saveStore(store)
  return { ok: true, user: sanitizeUser(updated) }
}

export async function listAllSubscriptionUsers() {
  const store = await loadStore()
  return store.users.map((user) => {
    const refreshed = refreshPaymentStatus(user)
    return {
      ...sanitizeUser(refreshed),
      trialStartedAt: refreshed.trialStartedAt ?? null,
      trialUsedAt: refreshed.trialUsedAt ?? null,
      emailVerifiedAt: refreshed.emailVerifiedAt ?? null,
    }
  })
}

export async function selectPaidPlan({ token, planId }) {
  const session = await resolveSubscriptionSession(token)
  if (!session?.user) {
    return { ok: false, status: 401, error: 'Sesión inválida o expirada.' }
  }
  const plan = String(planId ?? '').trim().toLowerCase()
  if (!PAID_PLAN_IDS.includes(plan)) {
    return { ok: false, status: 400, error: 'Seleccione un plan de suscripción válido.' }
  }

  const store = await loadStore()
  const index = store.users.findIndex((item) => item.id === session.user.id)
  if (index === -1) {
    return { ok: false, status: 404, error: 'Usuario no encontrado.' }
  }

  const current = store.users[index]
  if (isPaymentExempt(current)) {
    return { ok: false, status: 400, error: 'Esta cuenta no requiere un plan de pago.' }
  }

  const now = new Date().toISOString()
  const updated = {
    ...current,
    plan,
    estado_pago: 'activo',
    fecha_vencimiento: addDays(new Date(), PAID_PLAN_DAYS),
    updatedAt: now,
  }
  store.users[index] = updated
  await saveStore(store)
  return { ok: true, user: sanitizeUser(updated) }
}


