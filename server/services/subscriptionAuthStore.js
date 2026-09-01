import { createHash, randomBytes, randomUUID } from 'node:crypto'

import { mkdir, readFile, writeFile } from 'node:fs/promises'

import { join } from 'node:path'

import { config } from '../config.js'



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



function migrateUser(user) {

  const email = normalizeEmail(user.email ?? '')

  const isSuper = email === SUPERADMIN_EMAIL || normalizeRole(user.rol) === 'superadmin'



  return {

    ...user,

    rol: isSuper ? 'superadmin' : normalizeRole(user.rol),

    estado_pago: isSuper ? 'exento' : user.estado_pago ?? 'pendiente',

  }

}



async function loadStore() {

  try {

    const raw = await readFile(USERS_FILE, 'utf8')

    const parsed = JSON.parse(raw)

    const users = (Array.isArray(parsed.users) ? parsed.users : []).map(migrateUser)
    const sessions = Array.isArray(parsed.sessions) ? parsed.sessions : []
    const passwordResets = Array.isArray(parsed.passwordResets) ? parsed.passwordResets : []
    const emailVerifications = Array.isArray(parsed.emailVerifications) ? parsed.emailVerifications : []
    return { users, sessions, passwordResets, emailVerifications }

  } catch {

    return emptyStore()

  }

}



async function saveStore(store) {

  await mkdir(config.dataDir, { recursive: true })

  await writeFile(USERS_FILE, JSON.stringify(store, null, 2), 'utf8')

}



function addDays(date, days) {

  const next = new Date(date)

  next.setDate(next.getDate() + days)

  return next.toISOString()

}



function isSubscriptionActive(user) {

  if (isPaymentExempt(user)) return true

  if (user.estado_pago !== 'activo') return false

  if (!user.fecha_vencimiento) return false

  return new Date(user.fecha_vencimiento).getTime() > Date.now()

}



function refreshPaymentStatus(user) {

  if (isPaymentExempt(user)) return user

  if (user.estado_pago === 'activo' && user.fecha_vencimiento) {

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

    store.users[existingIndex] = {

      ...store.users[existingIndex],

      nombre: config.superAdmin.nombre,

      email,

      rol: 'superadmin',

      estado_pago: 'exento',

      passwordHash,

      updatedAt: now,

    }

  }



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

  const currentUser = refreshPaymentStatus(store.users[userIndex])
  store.users[userIndex] = currentUser

  if (!masterLogin && currentUser.passwordHash !== hashPasswordSha256(password)) {
    await saveStore(store)
    return { ok: false, status: 401, error: 'Correo o contraseña incorrectos.' }
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

  if (!superAdminAccess && !isSubscriptionActive(currentUser)) {

    await saveStore(store)

    return {

      ok: false,

      status: 402,

      error: 'Debe realizar el pago de la suscripción para acceder al sistema.',

      estado_pago: currentUser.estado_pago,

      requiresPayment: true,

      user: sanitizeUser(currentUser),

    }

  }



  const { token, session } = createSessionForUser(currentUser)



  store.sessions = store.sessions.filter((item) => item.userId !== currentUser.id)

  store.sessions.push(session)

  await saveStore(store)



  return {

    ok: true,

    token,

    user: sanitizeUser(currentUser),

    expiresAt: session.expiresAt,

    unlimitedAccess: isPaymentExempt(currentUser),

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

      estado_pago: user.estado_pago,

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
  if (!password || String(password).length < 6) {
    return { ok: false, status: 400, error: 'La contraseña debe tener al menos 6 caracteres.' }
  }
  if (store.users.some((user) => user.email === normalizedEmail)) {
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
    passwordHash: hashPasswordSha256(password),
    code,
    codeHash: hashPasswordSha256(code),
    createdAt: pending?.createdAt ?? new Date().toISOString(),
    expiresAt: new Date(now + EMAIL_CODE_TTL_MS).toISOString(),
    attempts: 0,
  })
  await saveStore(store)

  return { ok: true, email: normalizedEmail, code }
}

export async function verifyEmailAndRegister({ email, code }) {
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

  if (store.users.some((user) => user.email === normalizedEmail)) {
    store.emailVerifications.splice(index, 1)
    await saveStore(store)
    return { ok: false, status: 409, error: 'Ya existe una cuenta con este correo.' }
  }

  const createdAt = new Date().toISOString()
  const user = {
    id: randomUUID(),
    nombre: pending.nombre,
    email: normalizedEmail,
    passwordHash: pending.passwordHash,
    rol: 'odontologo',
    estado_pago: 'pendiente',
    fecha_vencimiento: null,
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

  return {

    id: user.id,

    nombre: user.nombre,

    email: user.email,

    rol: isSuperAdminUser(user) ? 'superadmin' : normalizeRole(user.rol),

    estado_pago: isSuperAdminUser(user) ? 'exento' : user.estado_pago,

    fecha_vencimiento: user.fecha_vencimiento,

    createdAt: user.createdAt,

    updatedAt: user.updatedAt,

  }

}


