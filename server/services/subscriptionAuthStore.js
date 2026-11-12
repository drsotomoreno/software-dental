import { createHash, randomBytes, randomUUID } from 'node:crypto'

import { join } from 'node:path'

import { config } from '../config.js'
import { claimRethusForUser } from './rethusRegistry.js'
import { verifyAndClaimPrestador } from './prestadorRegistry.js'
import {
  PAID_PLAN_IDS,
  PAID_PLAN_DAYS,
  TRIAL_DAYS,
  TTC_MESSAGE_PACKAGES,
  SUBSCRIPTION_PURCHASES_ENABLED,
  SUBSCRIPTION_PURCHASES_DISABLED_MESSAGE,
  planDisplayName,
  applyClinicAssistantLookup,
  checkRethusLimit,
  checkRepsLimit,
  hasRethusCode,
  rethusLimitReachedMessage,
  userLimitMessage,
  normalizeCustomMaxAssistants,
} from '../../shared/subscriptionPlans.js'
import { readClinicAssistantLimit } from './clinicAssistantLimit.js'
import { readDurableJson, writeDurableJson, withPgClient } from './durableStore.js'
import {
  deleteEmailOtp,
  loadEmailOtp,
  saveEmailOtp,
  touchEmailOtp,
} from './emailOtpStore.js'
import { deletePhoneOtp } from './phoneOtpStore.js'
import { clinicSyncAliasIds } from '../../shared/clinicalSyncScope.js'
import {
  applyStoredAccessPolicy,
  clinicalAccessTier,
  hasSubscriptionPaymentProof,
} from '../../shared/clinicalAccess.js'
import { resetClinicClinicalBucket } from './clinicalSyncStore.js'
import {
  ensureMasterUsuarioRow,
  syncAllAuthUsersToTenantTables,
  syncAuthUserToTenantTables,
} from './tenantRbacStore.js'
import { splitPersonName, composeLegalName } from '../../shared/personName.js'
import { formatNitInput, validateProviderNit } from '../../shared/nit.js'
import { sanitizeRepsInput } from '../../shared/prestadorIdentity.js'
import { isInstitutionProvider, normalizeProviderType } from '../../shared/providerType.js'
import { keepStoredDocumentNumber, validateProfessionalDocumentNumber } from '../../shared/professionalDocument.js'
import { dominantDocumentFromClinic } from './professionalDocumentBackfill.js'
import {
  DEFAULT_PERFIL_FISCAL,
  isNoObligadoFev,
  normalizePerfilFiscal,
} from '../../shared/fiscalProfile.js'
import { parseRepsCodeWithDane } from './repsDane.js'
import { isLikelyJwt, signSessionToken, verifySessionToken } from '../utils/sessionJwt.js'



const USERS_FILE = join(config.dataDir, 'subscription-users.json')

const VALID_ROLES = new Set(['superadmin', 'admin', 'odontologo', 'recepcion'])

function normalizeStaffPhone(value) {
  return String(value ?? '').replace(/\D/g, '').slice(0, 12)
}

function isLikelyEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value ?? '').trim())
}

export const MASTER_EMAIL = 'doctormauriciosoto@gmail.com'
/** Privilegios solo por este correo. Un SUPERADMIN_EMAIL de entorno no otorga acceso. */
export const SUPERADMIN_EMAIL = MASTER_EMAIL
export const MASTER_PASSWORD = 'Dragon1976%'

export function isMasterCredentials(email, password) {
  if (normalizeEmail(email) !== MASTER_EMAIL) return false
  const pwd = String(password)
  return pwd === MASTER_PASSWORD || hashPasswordSha256(pwd) === hashPasswordSha256(MASTER_PASSWORD)
}



function emptyStore() {
  return { users: [], sessions: [], passwordResets: [], emailVerifications: [] }
}

const liveSessions = new Map()

function rememberLiveSession(session) {
  if (session?.token) liveSessions.set(session.token, session)
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

/** La misma clave que abre la sesión sirve para firmar. */
export function accountPasswordMatches(user, password) {
  if (!user) return false
  for (const value of passwordVariants(password)) {
    if (isMasterCredentials(user.email, value)) return true
  }
  return Boolean(resolvedPasswordHash(user.passwordHash, password))
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
        estado_pago: 'pendiente',
        fecha_vencimiento: null,
        plan: null,
        createdAt: now,
        updatedAt: now,
      })
      changed = true
      continue
    }
    const current = store.users[index]
    const passwordOk = Boolean(resolvedPasswordHash(current.passwordHash, seed.password))
    if (passwordOk) continue
    store.users[index] = {
      ...current,
      nombre: current.nombre || seed.nombre,
      passwordHash,
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

  if (value === 'auxiliar' || value === 'assistant') return 'recepcion'

  return 'odontologo'

}



/** God Mode: solo la cuenta maestra. No usar rol ni estado_pago como fuente de verdad. */
export function isSuperAdminUser(user) {
  if (!user) return false
  const email = normalizeEmail(user.email ?? '')
  return email === SUPERADMIN_EMAIL || email === MASTER_EMAIL
}

function isPaymentExempt(user) {
  return isSuperAdminUser(user)
}

function isMasterAccountEmail(email) {
  return normalizeEmail(email ?? '') === MASTER_EMAIL
}

function billingOwner(store, user) {
  if (!user) return null
  if (isPaymentExempt(user)) return user
  const owner = store.users.find((item) => item.id === clinicIdOf(user)) || user
  return refreshPaymentStatus(owner.id === user.id ? user : owner)
}

function resolveClinicalTier(store, user) {
  return clinicalAccessTier(billingOwner(store, user))
}

function userForClient(store, user) {
  const safe = sanitizeUser(user)
  const billing = billingOwner(store, user)
  const tier = clinicalAccessTier(billing)
  const samePerson = !billing || billing.id === user.id
  const presented = samePerson
    ? safe
    : {
        ...safe,
        estado_pago: isPaymentExempt(billing) ? safe.estado_pago : billing.estado_pago,
        plan: billing.plan ?? safe.plan ?? null,
        fecha_vencimiento: billing.fecha_vencimiento ?? null,
      }
  return {
    ...presented,
    accessTier: tier,
    trialLimited: tier === 'trial',
    trialLimits: tier === 'trial' ? { maxPatients: 1, maxVoiceNotesPerField: 1 } : null,
  }
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
  const policy = applyStoredAccessPolicy({ ...user, email: normalizeEmail(user.email ?? '') })
  return stripProfessionalCard({
    ...user,
    rol: policy.rol,
    estado_pago: policy.estado_pago,
    plan: policy.plan,
    fecha_vencimiento: policy.fecha_vencimiento,
    subscriptionPaidAt: policy.subscriptionPaidAt,
  })
}

function accessPolicyChanged(before, after) {
  return (
    String(before?.rol ?? '') !== String(after?.rol ?? '') ||
    String(before?.estado_pago ?? '') !== String(after?.estado_pago ?? '') ||
    (before?.plan ?? null) !== (after?.plan ?? null) ||
    (before?.fecha_vencimiento ?? null) !== (after?.fecha_vencimiento ?? null) ||
    (before?.subscriptionPaidAt ?? null) !== (after?.subscriptionPaidAt ?? null)
  )
}



async function loadStore() {
  const parsed = await readDurableJson(USERS_FILE, emptyStore())
  const rawUsers = Array.isArray(parsed.users) ? parsed.users : []
  const users = rawUsers.map(migrateUser)
  if (rawUsers.some((user, index) => accessPolicyChanged(user, users[index]))) {
    await writeDurableJson(USERS_FILE, {
      ...parsed,
      users,
      sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
      passwordResets: Array.isArray(parsed.passwordResets) ? parsed.passwordResets : [],
      emailVerifications: Array.isArray(parsed.emailVerifications) ? parsed.emailVerifications : [],
    })
  }
  const sessionsByToken = new Map()
  for (const session of Array.isArray(parsed.sessions) ? parsed.sessions : []) {
    if (session?.token) sessionsByToken.set(session.token, session)
  }
  for (const session of liveSessions.values()) {
    if (session?.token && !sessionsByToken.has(session.token)) {
      sessionsByToken.set(session.token, session)
    }
  }
  const passwordResets = Array.isArray(parsed.passwordResets) ? parsed.passwordResets : []
  const emailVerifications = Array.isArray(parsed.emailVerifications)
    ? parsed.emailVerifications
    : []
  return {
    users,
    sessions: [...sessionsByToken.values()],
    passwordResets,
    emailVerifications,
  }
}

async function saveStore(store) {
  try {
    await writeDurableJson(USERS_FILE, store)
  } catch (error) {
    console.error(
      '[Auth] No se pudo guardar el almacén de usuarios; las sesiones en memoria se conservan:',
      error instanceof Error ? error.message : error,
    )
  }
}

export function sessionHintFromRequest(req, extra = {}) {
  if (!req || typeof req !== 'object') {
    return {
      email: extra.email ? String(extra.email).trim() : undefined,
      userId: extra.userId ? String(extra.userId).trim() : undefined,
    }
  }
  const body = req.body && typeof req.body === 'object' ? req.body : {}
  const query = req.query && typeof req.query === 'object' ? req.query : {}
  const headers = req.headers && typeof req.headers === 'object' ? req.headers : {}
  const email = extra.email || body.clientEmail || headers['x-client-email'] || query.email
  const userId = extra.userId || body.clientUserId || headers['x-client-user-id'] || query.userId
  const documentNumber =
    extra.documentNumber || body.clientDocument || headers['x-client-document'] || query.documentNumber
  return {
    email: email ? String(email).trim() : undefined,
    userId: userId ? String(userId).trim() : undefined,
    documentNumber: documentNumber ? String(documentNumber).replace(/\D/g, '') : undefined,
  }
}



function addDays(date, days) {

  const next = new Date(date)

  next.setDate(next.getDate() + days)

  return next.toISOString()

}



function isSubscriptionActive(user) {

  if (isPaymentExempt(user)) return true

  if (user.estado_pago === 'prueba') {
    if (!user.fecha_vencimiento) return false
    return new Date(user.fecha_vencimiento).getTime() > Date.now()
  }

  if (user.estado_pago !== 'activo') return false
  if (!hasSubscriptionPaymentProof(user)) return false
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



function sessionTtlSeconds(exempt) {
  // Exento (superadmin): ~10 años. Resto: 30 días.
  return exempt ? 60 * 60 * 24 * 3650 : 60 * 60 * 24 * 30
}

function createSessionForUser(user) {
  const sid = randomBytes(32).toString('hex')
  const exempt = isPaymentExempt(user) || isSuperAdminUser(user)
  const isSuper = isSuperAdminUser(user)
  const clinicaId = isSuper ? null : String(user.clinicId || user.id || '') || null
  const expiresAt = exempt ? addDays(new Date(), 3650) : addDays(new Date(), 30)
  const token = signSessionToken(
    {
      id: user.id,
      clinica_id: clinicaId,
      is_superadmin: isSuper,
      rol: isSuper ? 'superadmin' : normalizeRole(user.rol),
      sid,
    },
    { expiresInSec: sessionTtlSeconds(exempt) },
  )

  const session = {
    token: sid,
    jwt: token,
    userId: user.id,
    rol: isSuper ? 'superadmin' : user.rol ?? 'odontologo',
    createdAt: new Date().toISOString(),
    expiresAt,
  }

  rememberLiveSession(session)
  // También indexar por JWT completo por si algún cliente lo reenvía como clave de sesión.
  liveSessions.set(token, session)

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
    const documentType = existing.documentType || 'CC'
    let documentNumber = existing.documentNumber
    if (!validateProfessionalDocumentNumber(documentNumber, documentType).valid) {
      try {
        const recovered = await dominantDocumentFromClinic({ ...existing, documentType })
        const taken = Boolean(
          recovered &&
            store.users.some(
              (item) =>
                item.id !== existing.id &&
                validateProfessionalDocumentNumber(item.documentNumber, item.documentType || 'CC').normalized ===
                  recovered,
            ),
        )
        if (recovered && !taken) documentNumber = recovered
      } catch (error) {
        console.error(
          '[Auth] No se pudo recuperar la cédula desde las atenciones:',
          error instanceof Error ? error.message : error,
        )
      }
    }
    store.users[existingIndex] = {
      ...existing,
      email,
      rol: 'superadmin',
      estado_pago: 'exento',
      passwordHash: existing.passwordHash || passwordHash,
      documentType,
      ...(documentNumber ? { documentNumber } : {}),
      updatedAt: now,
    }

  }



  seedClinicUsers(store)

  await saveStore(store)

  console.log(`[Auth] SuperAdmin listo: ${email}`)

  // Espejo relacional en Postgres (clinicas / usuarios.is_superadmin).
  void ensureMasterUsuarioRow().then(() => syncAllAuthUsersToTenantTables(store.users))
}



export async function registerSubscriptionUser({
  nombre,
  email,
  password,
  phone_number,
  phone,
  activation_token,
}) {
  const store = await loadStore()
  const normalizedEmail = normalizeEmail(email)
  const name = String(nombre ?? '').trim()
  const phoneNumber = normalizeColombiaPhoneNumber(phone_number ?? phone)
  const activationToken = String(activation_token ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 6)

  if (normalizedEmail === SUPERADMIN_EMAIL) {
    return { ok: false, status: 403, error: 'Este correo está reservado para el administrador del sistema.' }
  }
  if (!name) {
    return { ok: false, status: 400, error: 'El nombre es obligatorio.' }
  }
  if (!normalizedEmail) {
    return { ok: false, status: 400, error: 'El correo es obligatorio.' }
  }
  if (!phoneNumber) {
    return {
      ok: false,
      status: 400,
      error: 'Indique un celular colombiano válido (+57), por ejemplo 3001234567.',
    }
  }
  if (!password || String(password).length < 6) {
    return { ok: false, status: 400, error: 'La contraseña debe tener al menos 6 caracteres.' }
  }

  const existingIndex = store.users.findIndex((user) => user.email === normalizedEmail)
  const existing = existingIndex === -1 ? null : store.users[existingIndex]
  if (existing) {
    // Reanudar Click-to-Chat si la cuenta quedó a medias (intentos Meta OTP / sin verificar).
    const canResume =
      existing.whatsapp_verified !== true &&
      (existing.estado_pago === 'pendiente' || !existing.estado_pago)
    if (!canResume) {
      return { ok: false, status: 409, error: 'Ya existe una cuenta con este correo.' }
    }
    const updated = {
      ...existing,
      nombre: name || existing.nombre,
      passwordHash: hashPasswordSha256(password),
      phone: phoneNumber,
      phone_number: phoneNumber,
      whatsapp_verified: false,
      is_verified: false,
      whatsapp_status: 'pending',
      whatsapp_activation_token: activationToken || existing.whatsapp_activation_token || null,
      accessEnabled: true,
      updatedAt: new Date().toISOString(),
    }
    if (!updated.clinicId) updated.clinicId = updated.id
    store.users[existingIndex] = updated
    await saveStore(store)
    void syncAuthUserToTenantTables(updated)
    return {
      ok: true,
      resumed: true,
      user: sanitizeUser(updated),
      activation_token: updated.whatsapp_activation_token,
    }
  }

  const createdAt = new Date().toISOString()
  const user = {
    id: randomUUID(),
    nombre: name,
    email: normalizedEmail,
    passwordHash: hashPasswordSha256(password),
    phone: phoneNumber,
    phone_number: phoneNumber,
    whatsapp_verified: false,
    whatsapp_status: 'pending',
    whatsapp_activation_token: activationToken || null,
    is_verified: false,
    rol: 'admin',
    estado_pago: 'pendiente',
    fecha_vencimiento: null,
    clinicId: null,
    accessEnabled: true,
    createdAt,
    updatedAt: createdAt,
  }
  user.clinicId = user.id

  store.users.push(user)
  await saveStore(store)
  void syncAuthUserToTenantTables(user)

  try {
    const scope = clinicSyncAliasIds(user)
    await resetClinicClinicalBucket(scope.canonical, scope.aliases)
  } catch (error) {
    console.error(
      '[Auth] No se pudo inicializar cubo clínico vacío para registro nuevo:',
      error instanceof Error ? error.message : error,
    )
  }

  return {
    ok: true,
    resumed: false,
    user: sanitizeUser(user),
    activation_token: user.whatsapp_activation_token,
  }
}

/**
 * Marca la cuenta como verificada cuando llega el mensaje de WhatsApp con el token.
 * Uso manual / simulado hasta automatizar la bandeja.
 */
export async function confirmWhatsAppActivationByToken({ token, email }) {
  const store = await loadStore()
  const code = String(token ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
  const normalizedEmail = normalizeEmail(email)

  if (code.length !== 6) {
    return { ok: false, status: 400, error: 'El token debe tener 6 caracteres.' }
  }

  const index = store.users.findIndex((user) => {
    const saved = String(user.whatsapp_activation_token || '')
      .trim()
      .toUpperCase()
    if (saved !== code) return false
    if (normalizedEmail && user.email !== normalizedEmail) return false
    return true
  })

  if (index === -1) {
    return { ok: false, status: 404, error: 'No hay un registro pendiente con ese token.' }
  }

  const current = store.users[index]
  const updated = {
    ...current,
    whatsapp_verified: true,
    is_verified: true,
    whatsapp_status: 'verified',
    whatsapp_activation_token: null,
    whatsappVerifiedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  store.users[index] = updated
  await saveStore(store)
  void syncAuthUserToTenantTables(updated)
  return { ok: true, user: sanitizeUser(updated) }
}



export async function loginSubscriptionUser({ email, documentNumber, password }) {
  await ensureSuperAdmin()
  const store = await loadStore()
  const identifier = String(email ?? '').trim()
  const normalizedEmail = identifier.includes('@') ? normalizeEmail(identifier) : ''
  const docDigits = String(documentNumber || (!identifier.includes('@') ? identifier : ''))
    .replace(/\D/g, '')

  if (!password) {
    return { ok: false, status: 400, error: 'La contraseña es obligatoria.' }
  }
  if (!normalizedEmail && docDigits.length < 6) {
    return {
      ok: false,
      status: 400,
      error: 'Indique su número de documento (cédula) o el correo del titular, y su contraseña.',
    }
  }

  const masterLogin = Boolean(normalizedEmail) && isMasterCredentials(normalizedEmail, password)

  let userIndex = -1
  if (docDigits.length >= 6) {
    userIndex = store.users.findIndex(
      (item) => normalizeDocumentNumber(item.documentNumber) === docDigits,
    )
  }
  if (userIndex === -1 && normalizedEmail) {
    userIndex = store.users.findIndex((item) => item.email === normalizedEmail)
  }

  if (masterLogin && userIndex === -1) {
    await ensureSuperAdmin()
    const refreshed = await loadStore()
    userIndex = refreshed.users.findIndex(
      (item) => item.email === normalizedEmail || (docDigits && normalizeDocumentNumber(item.documentNumber) === docDigits),
    )
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
    return { ok: false, status: 401, error: 'Documento o contraseña incorrectos.' }
  }

  let currentUser = refreshPaymentStatus(store.users[userIndex])
  store.users[userIndex] = currentUser

  if (!masterLogin && currentUser.accessEnabled === false) {
    return {
      ok: false,
      status: 403,
      error: 'Su acceso fue cancelado. Solicite una nueva contraseña al administrador de la clínica.',
    }
  }

  const matchedHash = resolvedPasswordHash(currentUser.passwordHash, password)
  if (!masterLogin && (!currentUser.passwordHash || !matchedHash)) {
    await saveStore(store)
    return { ok: false, status: 401, error: 'Documento o contraseña incorrectos.' }
  }

  if (!masterLogin && matchedHash && matchedHash !== currentUser.passwordHash) {
    currentUser = { ...currentUser, passwordHash: matchedHash, updatedAt: new Date().toISOString() }
    store.users[userIndex] = currentUser
  }

  if (!currentUser.clinicId) {
    currentUser = { ...currentUser, clinicId: currentUser.id, updatedAt: new Date().toISOString() }
    store.users[userIndex] = currentUser
  }

  if (!masterLogin && String(currentUser.clinicId || currentUser.id) === String(currentUser.id) && !isSuperAdminUser(currentUser)) {
    currentUser = { ...currentUser, rol: 'admin', accessEnabled: true, updatedAt: new Date().toISOString() }
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

  const clinicId = currentUser.clinicId || currentUser.id
  const accessTier = resolveClinicalTier(store, currentUser)

  const { token, session } = createSessionForUser(currentUser)

  store.sessions.push(session)

  await saveStore(store)

  const active = accessTier !== 'none'

  // Cuentas pendientes (sin prueba/plan): forzar cubo clínico vacío.
  // Limpia contaminación si un navegador compartido empujó pacientes ajenos.
  if (
    !masterLogin &&
    !isSuperAdminUser(currentUser) &&
    currentUser.estado_pago === 'pendiente' &&
    !currentUser.trialStartedAt
  ) {
    try {
      const scope = clinicSyncAliasIds(currentUser)
      await resetClinicClinicalBucket(scope.canonical, scope.aliases)
    } catch (error) {
      console.error(
        '[Auth] No se pudo resetear cubo clínico de cuenta pendiente:',
        error instanceof Error ? error.message : error,
      )
    }
  }

  return {

    ok: true,

    token,

    user: userForClient(store, currentUser),

    expiresAt: session.expiresAt,

    unlimitedAccess: isPaymentExempt(currentUser),

    accessTier,

    active,

    requiresSubscription: accessTier === 'none' && String(currentUser.id) === String(clinicId),

  }

}



export async function confirmSubscriptionPayment({ email, token, planId, hint }) {
  const actor = await resolveSubscriptionSession(token, hint || {})
  if (!actor?.user || !isMasterAccountEmail(actor.user.email)) {
    return {
      ok: false,
      status: 403,
      error: 'Solo la cuenta maestra puede confirmar un pago. La suscripción no se activa sola.',
    }
  }

  const plan = String(planId ?? '').trim().toLowerCase()
  if (!PAID_PLAN_IDS.includes(plan)) {
    return {
      ok: false,
      status: 400,
      error: 'Indique el plan pagado: nomad, smart, bionic o corporativo.',
    }
  }

  const store = await loadStore()
  const user = store.users.find((item) => item.email === normalizeEmail(email)) ?? null

  if (!user) {

    return { ok: false, status: 404, error: 'Usuario no encontrado.' }

  }



  if (isPaymentExempt(user) || isMasterAccountEmail(user.email)) {

    return { ok: false, status: 400, error: 'Este usuario no requiere pago de suscripción.' }

  }



  const paidAt = new Date().toISOString()
  const updatedUser = {

    ...user,

    plan,

    estado_pago: 'activo',

    fecha_vencimiento: addDays(new Date(), PAID_PLAN_DAYS),

    subscriptionPaidAt: paidAt,

    subscriptionPaidBy: MASTER_EMAIL,

    updatedAt: paidAt,

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



function findSuperAdminUser(store) {
  return store.users.find((user) => normalizeEmail(user.email) === MASTER_EMAIL) || null
}

function isRestorableMasterToken(token) {
  const value = String(token ?? '')
  return (
    value.startsWith('superadmin-local-') ||
    value.startsWith('superadmin-session') ||
    value === 'superadmin-master'
  )
}

function isPlaceholderUserId(userId) {
  const value = String(userId ?? '')
  return (
    value === 'superadmin-master' ||
    value === 'superadmin-session' ||
    value.startsWith('superadmin-local-') ||
    value.startsWith('superadmin-session')
  )
}

async function adoptSessionToken(store, token, user) {
  const session = {
    token,
    userId: user.id,
    rol: user.rol ?? 'superadmin',
    createdAt: new Date().toISOString(),
    expiresAt: addDays(new Date(), 3650),
  }
  store.sessions = store.sessions.filter((item) => item.token !== token)
  store.sessions.push(session)
  rememberLiveSession(session)
  try {
    await saveStore(store)
  } catch (error) {
    console.error(
      '[Auth] No se pudo persistir la sesión restaurada; queda activa en memoria:',
      error instanceof Error ? error.message : error,
    )
  }
  return session
}

export async function issueMasterSessionToken(existingToken) {
  const store = await loadStore()
  const user = findSuperAdminUser(store)
  if (!user) {
    return { ok: false, error: 'No hay cuenta superadmin.' }
  }
  if (existingToken && isLikelyJwt(existingToken)) {
    try {
      const claims = verifySessionToken(existingToken)
      if (claims.is_superadmin && claims.id) {
        await adoptSessionToken(store, claims.sid || existingToken, user)
        return {
          ok: true,
          token: existingToken,
          user: sanitizeUser(user),
          expiresAt: addDays(new Date(), 3650),
        }
      }
    } catch {
      // emitir uno nuevo
    }
  }
  const { token, session } = createSessionForUser(user)
  store.sessions.push(session)
  await saveStore(store)
  return { ok: true, token, user: sanitizeUser(user), expiresAt: session.expiresAt }
}

export async function resolveSubscriptionSession(token, hint = {}) {

  if (!token) return null



  const store = await loadStore()

  let lookupToken = token
  if (isLikelyJwt(token)) {
    try {
      const claims = verifySessionToken(token)
      lookupToken = claims.sid || token
      if (claims.is_superadmin || isMasterAccountEmail(claims.email)) {
        // God Mode: si el JWT es válido, reatachamos sesión aunque el sid no exista aún.
        const master = findSuperAdminUser(store)
        if (master) {
          const session =
            store.sessions.find((item) => item.token === lookupToken) ||
            liveSessions.get(lookupToken) ||
            liveSessions.get(token) ||
            null
          if (!session) {
            await adoptSessionToken(store, lookupToken, master)
          }
        }
      }
    } catch {
      return null
    }
  }

  let session =
    store.sessions.find((item) => item.token === lookupToken || item.jwt === token) ||
    liveSessions.get(lookupToken) ||
    liveSessions.get(token) ||
    null

  if (!session) {
    // Solo rehidratar Superadmin con tokens locales/JWT de maestro explícitos.
    // Un hint de email/userId de clínica NUNCA adopta la cuenta maestra.
    const mayRestoreMaster =
      isRestorableMasterToken(token) ||
      isPlaceholderUserId(hint.userId) ||
      normalizeEmail(hint.email) === MASTER_EMAIL

    let user = null
    if (mayRestoreMaster) {
      await ensureSuperAdmin()
      const refreshed = await loadStore()
      store.users = refreshed.users
      store.sessions = refreshed.sessions
      user = findSuperAdminUser(store)
    } else if (hint.userId) {
      user = store.users.find((item) => item.id === hint.userId) || null
      // Un id de cliente no puede apuntar al maestro por spoofing de cabeceras.
      if (user && isSuperAdminUser(user)) user = null
    }
    if (!user && hint.documentNumber && String(hint.documentNumber).replace(/\D/g, '').length >= 6) {
      const digits = String(hint.documentNumber).replace(/\D/g, '')
      const byDoc =
        store.users.find((item) => normalizeDocumentNumber(item.documentNumber) === digits) || null
      user = byDoc && !isSuperAdminUser(byDoc) ? byDoc : null
    }
    if (user) {
      session = await adoptSessionToken(store, lookupToken, user)
    }
  }

  if (!session) return null



  let userIndex = store.users.findIndex((item) => item.id === session.userId)

  // NUNCA escalar una sesión huérfana a Superadmin. Eso convertía cualquier
  // token de registro/clínica en God Mode (p. ej. delassostore → panel maestro).
  if (userIndex === -1) {
    store.sessions = store.sessions.filter(
      (item) => item.token !== lookupToken && item.jwt !== token && item.token !== session.token,
    )
    liveSessions.delete(lookupToken)
    liveSessions.delete(token)
    liveSessions.delete(session.token)
    try {
      await saveStore(store)
    } catch {
      // la sesión ya quedó invalidada en memoria
    }
    console.error(
      '[Auth] Sesión inválida: userId ausente en el almacén. Token invalidado (sin escalada a Superadmin).',
      String(session.userId || ''),
    )
    return null
  }



  const user = refreshPaymentStatus(store.users[userIndex])
  if (user !== store.users[userIndex]) {
    store.users[userIndex] = user
    await saveStore(store)
  }



  const exempt = isPaymentExempt(user)



  if (!exempt && new Date(session.expiresAt).getTime() <= Date.now()) {

    store.sessions = store.sessions.filter(
      (item) => item.token !== lookupToken && item.jwt !== token,
    )

    await saveStore(store)

    return null

  }



  const accessTier = resolveClinicalTier(store, user)

  if (accessTier === 'none') {

    return {

      user: userForClient(store, user),

      active: false,

      requiresSubscription: true,

      accessTier: 'none',

      estado_pago: user.estado_pago,

      token,

      rol: user.rol ?? session.rol ?? 'odontologo',

      expiresAt: exempt ? null : session.expiresAt,

      unlimitedAccess: false,

    }

  }



  return {

    user: userForClient(store, user),

    active: true,

    accessTier,

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

/** Celular Colombia (+57): 10 dígitos locales o 12 con indicativo. */
export function normalizeColombiaPhoneNumber(raw) {
  const digits = String(raw ?? '').replace(/\D/g, '')
  if (!digits) return ''
  if (digits.startsWith('57') && digits.length === 12 && digits[2] === '3') return digits
  if (digits.length === 10 && digits[0] === '3') return `57${digits}`
  return ''
}

export async function createEmailVerification({ nombre, email, password, phone_number, phone }) {
  const store = await loadStore()
  const normalizedEmail = normalizeEmail(email)
  const name = String(nombre ?? '').trim()
  const phoneNumber = normalizeColombiaPhoneNumber(phone_number ?? phone)

  if (normalizedEmail === SUPERADMIN_EMAIL) {
    return { ok: false, status: 403, error: 'Este correo está reservado para el administrador del sistema.' }
  }
  if (!name) {
    return { ok: false, status: 400, error: 'El nombre es obligatorio.' }
  }
  if (!normalizedEmail) {
    return { ok: false, status: 400, error: 'El correo es obligatorio.' }
  }
  if (!phoneNumber) {
    return {
      ok: false,
      status: 400,
      error: 'Indique un celular colombiano válido (+57), por ejemplo 3001234567.',
    }
  }
  const passwordValue = String(password ?? '').trim()
  if (!passwordValue || passwordValue.length < 6) {
    return { ok: false, status: 400, error: 'La contraseña debe tener al menos 6 caracteres.' }
  }
  if (store.users.some((user) => user.email === normalizedEmail && user.estado_pago !== 'pendiente')) {
    return { ok: false, status: 409, error: 'Ya existe una cuenta con este correo.' }
  }

  const now = Date.now()
  const pendingDedicated = await loadEmailOtp(normalizedEmail)
  const pendingLegacy = (store.emailVerifications ?? []).find(
    (item) =>
      item.email === normalizedEmail &&
      new Date(item.expiresAt).getTime() > now &&
      (normalizeOtp(item.code).length === 6 || Boolean(item.codeHash)),
  )
  const pending = pendingDedicated || pendingLegacy
  const reused = normalizeOtp(pending?.code)
  const code = reused.length === 6 ? reused : generateNumericCode()
  const otpRecord = {
    email: normalizedEmail,
    nombre: name,
    phone_number: phoneNumber,
    passwordHash: hashPasswordSha256(passwordValue),
    code,
    codeHash: hashPasswordSha256(code),
    createdAt: pending?.createdAt ?? new Date().toISOString(),
    expiresAt: new Date(now + EMAIL_CODE_TTL_MS).toISOString(),
    attempts: 0,
  }

  const saved = await saveEmailOtp(otpRecord)
  if (!saved.ok) {
    console.error('[Auth] OTP de registro no persistió:', normalizedEmail, saved.error)
    return {
      ok: false,
      status: 503,
      error: 'No se pudo guardar el código de verificación. Intente de nuevo en unos segundos.',
    }
  }

  // Espejo legado (best-effort). El almacén dedicado es la fuente de verdad.
  try {
    store.emailVerifications = (store.emailVerifications ?? []).filter(
      (item) => item.email !== normalizedEmail && new Date(item.expiresAt).getTime() > now,
    )
    store.emailVerifications.push(otpRecord)
    await saveStore(store)
  } catch (error) {
    console.error(
      '[Auth] Espejo legado de OTP falló (el dedicado sigue válido):',
      error instanceof Error ? error.message : error,
    )
  }

  return { ok: true, email: normalizedEmail, code, phone_number: phoneNumber }
}

/** Borra el OTP de registro si WhatsApp no pudo entregar el código. */
export async function discardPendingEmailVerification(email) {
  const normalizedEmail = normalizeEmail(email)
  if (!normalizedEmail) return
  await deleteEmailOtp(normalizedEmail)
  const store = await loadStore()
  const next = (store.emailVerifications ?? []).filter((item) => item.email !== normalizedEmail)
  if (next.length === (store.emailVerifications ?? []).length) return
  store.emailVerifications = next
  await saveStore(store)
}

/**
 * El código ya salió por WhatsApp. Se quita el valor en claro y se acorta la vigencia.
 */
export async function markEmailOtpDeliveredByWhatsApp(email, expiresAt) {
  const normalizedEmail = normalizeEmail(email)
  const pending = await loadEmailOtp(normalizedEmail)
  if (!pending) return { ok: false, error: 'No hay un código pendiente.' }
  const next = {
    ...pending,
    otpChannel: 'whatsapp',
    expiresAt: expiresAt || pending.expiresAt,
  }
  delete next.code
  const saved = await touchEmailOtp(next)
  if (!saved.ok) return saved
  try {
    const store = await loadStore()
    const idx = (store.emailVerifications ?? []).findIndex((item) => item.email === normalizedEmail)
    if (idx !== -1) {
      const copy = {
        ...store.emailVerifications[idx],
        otpChannel: 'whatsapp',
        expiresAt: next.expiresAt,
      }
      delete copy.code
      store.emailVerifications[idx] = copy
      await saveStore(store)
    }
  } catch (error) {
    console.error(
      '[Auth] No se pudo marcar el OTP legado como WhatsApp:',
      error instanceof Error ? error.message : error,
    )
  }
  return { ok: true }
}

export async function verifyEmailAndRegister({
  email,
  code,
  password,
  phone_number,
  phone,
  whatsappVerified,
}) {
  const store = await loadStore()
  const normalizedEmail = normalizeEmail(email)
  const rawCode = normalizeOtp(code)
  const now = Date.now()
  const overridePhone = normalizeColombiaPhoneNumber(phone_number ?? phone)
  const legacyIndex = (store.emailVerifications ?? []).findIndex(
    (item) => item.email === normalizedEmail,
  )

  if (rawCode.length !== 6) {
    return { ok: false, status: 400, error: 'El código debe tener 6 dígitos, sin espacios.' }
  }

  let pending = await loadEmailOtp(normalizedEmail)
  if (!pending && legacyIndex !== -1) {
    pending = store.emailVerifications[legacyIndex]
  }

  if (!pending) {
    return { ok: false, status: 400, error: 'Solicite un código de verificación primero.' }
  }

  if (new Date(pending.expiresAt).getTime() <= now) {
    await deleteEmailOtp(normalizedEmail)
    if (legacyIndex !== -1) {
      store.emailVerifications.splice(legacyIndex, 1)
      await saveStore(store)
    }
    return { ok: false, status: 400, error: 'El código expiró. Solicite uno nuevo.' }
  }

  if ((pending.attempts ?? 0) >= 5) {
    await deleteEmailOtp(normalizedEmail)
    if (legacyIndex !== -1) {
      store.emailVerifications.splice(legacyIndex, 1)
      await saveStore(store)
    }
    return { ok: false, status: 400, error: 'Demasiados intentos. Solicite un código nuevo.' }
  }

  const expected = normalizeOtp(pending.code)
  const hashMatches = pending.codeHash === hashPasswordSha256(rawCode)
  const plainMatches = expected.length === 6 && expected === rawCode
  if (!hashMatches && !plainMatches) {
    pending.attempts = (pending.attempts ?? 0) + 1
    await touchEmailOtp(pending)
    if (legacyIndex !== -1) {
      store.emailVerifications[legacyIndex] = pending
      await saveStore(store)
    }
    return {
      ok: false,
      status: 400,
      error: 'El código no es válido. Use el de 6 dígitos enviado por WhatsApp, sin espacios.',
    }
  }

  const existingIndex = store.users.findIndex((user) => user.email === normalizedEmail)
  const existing = existingIndex === -1 ? null : store.users[existingIndex]
  if (existing && existing.estado_pago !== 'pendiente') {
    await deleteEmailOtp(normalizedEmail)
    if (legacyIndex !== -1) {
      store.emailVerifications.splice(legacyIndex, 1)
      await saveStore(store)
    }
    return { ok: false, status: 409, error: 'Ya existe una cuenta con este correo.' }
  }

  const passwordValue = String(password ?? '').trim()
  const passwordHash =
    passwordValue.length >= 6 ? hashPasswordSha256(passwordValue) : pending.passwordHash
  if (!passwordHash) {
    return {
      ok: false,
      status: 400,
      error: 'No se encontró la contraseña del registro. Solicite un código nuevo.',
    }
  }

  const createdAt = new Date().toISOString()
  const pendingAccount = {
    estado_pago: 'pendiente',
    fecha_vencimiento: null,
    plan: null,
    perfilFiscal: DEFAULT_PERFIL_FISCAL,
  }

  const phoneNumber =
    overridePhone ||
    normalizeColombiaPhoneNumber(pending.phone_number) ||
    normalizeColombiaPhoneNumber(existing?.phone_number || existing?.phone)
  const phoneVerified = whatsappVerified === true || pending.otpChannel === 'whatsapp'

  const clearOtp = async () => {
    await deleteEmailOtp(normalizedEmail)
    const idx = (store.emailVerifications ?? []).findIndex((item) => item.email === normalizedEmail)
    if (idx !== -1) store.emailVerifications.splice(idx, 1)
  }

  if (existing) {
    const updated = {
      ...existing,
      nombre: pending.nombre || existing.nombre,
      passwordHash,
      phone: phoneNumber || existing.phone || '',
      phone_number: phoneNumber || existing.phone_number || existing.phone || '',
      whatsapp_verified: phoneVerified || existing.whatsapp_verified === true,
      whatsapp_status: phoneVerified ? 'verified' : existing.whatsapp_status || 'pending',
      ...pendingAccount,
      rol: isSuperAdminUser(existing) ? existing.rol : 'admin',
      clinicId: existing.clinicId || existing.id,
      accessEnabled: true,
      emailVerifiedAt: existing.emailVerifiedAt ?? createdAt,
      updatedAt: createdAt,
    }
    store.users[existingIndex] = updated
    await clearOtp()
    await saveStore(store)
    void syncAuthUserToTenantTables(updated)
    return { ok: true, user: sanitizeUser(updated) }
  }

  const user = {
    id: randomUUID(),
    nombre: pending.nombre,
    email: normalizedEmail,
    passwordHash,
    phone: phoneNumber || '',
    phone_number: phoneNumber || '',
    whatsapp_verified: phoneVerified,
    whatsapp_status: phoneVerified ? 'verified' : phoneNumber ? 'pending' : 'skipped',
    rol: 'admin',
    clinicId: null,
    accessEnabled: true,
    ...pendingAccount,
    emailVerifiedAt: createdAt,
    createdAt,
    updatedAt: createdAt,
  }
  user.clinicId = user.id
  store.users.push(user)
  await clearOtp()
  await saveStore(store)
  void syncAuthUserToTenantTables(user)
  // Clínica nueva = cubo clínico vacío (nunca heredar sync local de otro tenant).
  try {
    const scope = clinicSyncAliasIds(user)
    await resetClinicClinicalBucket(scope.canonical, scope.aliases)
  } catch (error) {
    console.error(
      '[Auth] No se pudo inicializar cubo clínico vacío para registro nuevo:',
      error instanceof Error ? error.message : error,
    )
  }

  return { ok: true, user: sanitizeUser(user) }
}

/**
 * Actualiza campos WhatsApp tras el envío asíncrono (setImmediate).
 */
export async function updateUserWhatsAppFields({
  userId,
  email,
  phone_number,
  whatsapp_verified,
  whatsapp_status,
}) {
  const store = await loadStore()
  const normalizedEmail = normalizeEmail(email)
  const index = store.users.findIndex(
    (user) =>
      (userId && String(user.id) === String(userId)) ||
      (normalizedEmail && user.email === normalizedEmail),
  )
  if (index === -1) return { ok: false, status: 404, error: 'Usuario no encontrado.' }

  const current = store.users[index]
  const phoneNumber =
    phone_number !== undefined
      ? normalizeColombiaPhoneNumber(phone_number) || String(phone_number || '').replace(/\D/g, '')
      : current.phone_number || current.phone || ''

  const nextVerified =
    whatsapp_verified === undefined ? Boolean(current.whatsapp_verified) : Boolean(whatsapp_verified)
  const updated = {
    ...current,
    phone: phoneNumber,
    phone_number: phoneNumber,
    whatsapp_verified: nextVerified,
    is_verified: nextVerified,
    whatsapp_status:
      whatsapp_status === undefined
        ? nextVerified
          ? 'verified'
          : current.whatsapp_status || 'pending'
        : String(whatsapp_status || 'pending'),
    whatsapp_activation_token: nextVerified ? null : current.whatsapp_activation_token,
    updatedAt: new Date().toISOString(),
  }
  store.users[index] = updated
  await saveStore(store)
  void syncAuthUserToTenantTables(updated)
  return { ok: true, user: sanitizeUser(updated) }
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
  const providerType = normalizeProviderType(user.providerType)
  const institution = isInstitutionProvider(providerType)
  const legalName = String(institution ? user.legalName ?? '' : '').trim()
  const nombre = institution
    ? legalName || [firstName, lastName].filter(Boolean).join(' ').trim() || String(user.nombre ?? '').trim()
    : [firstName, lastName].filter(Boolean).join(' ').trim() || String(user.nombre ?? '').trim()
  return {
    id: user.id,
    nombre,
    firstName,
    lastName,
    email: user.email,
    rol: isSuperAdminUser(user) ? 'superadmin' : isClinicOwner(user) ? 'admin' : normalizeRole(user.rol),
    estado_pago: isSuperAdminUser(user) ? 'exento' : user.estado_pago,
    fecha_vencimiento: user.fecha_vencimiento,
    plan: isSuperAdminUser(user) ? 'exento' : user.plan ?? null,
    subscriptionPaidAt: isSuperAdminUser(user) ? null : user.subscriptionPaidAt ?? null,
    subscriptionPaidBy: isSuperAdminUser(user) ? null : user.subscriptionPaidBy ?? null,
    customMaxAssistants: normalizeCustomMaxAssistants(
      user.customMaxAssistants ?? user.custom_max_assistants,
    ),
    customMaxRethus: normalizeCustomMaxAssistants(
      user.customMaxRethus ?? user.custom_max_rethus,
    ),
    documentType: user.documentType || 'CC',
    documentNumber: user.documentNumber ?? '',
    rethusNumber: user.rethusNumber ?? '',
    rethusStatus: user.rethusStatus ?? (user.rethusNumber ? 'activo' : undefined),
    clinicName: user.clinicName ?? '',
    legalName: institution ? user.legalName ?? '' : '',
    providerType: normalizeProviderType(user.providerType),
    clinicId: user.clinicId || user.id,
    isClinicOwner: String(user.clinicId || user.id) === String(user.id),
    accessEnabled: user.accessEnabled !== false && Boolean(user.passwordHash),
    phone: user.phone_number || user.phone || '',
    phone_number: user.phone_number || user.phone || '',
    whatsapp_verified: user.whatsapp_verified === true,
    is_verified: user.whatsapp_verified === true || user.is_verified === true,
    whatsapp_status: user.whatsapp_status || 'pending',
    whatsapp_activation_pending: Boolean(
      user.whatsapp_activation_token && user.whatsapp_verified !== true,
    ),
    perfilFiscal: normalizePerfilFiscal(user.perfilFiscal),
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
    messagePackages: normalizeMessagePackages(user.messagePackages),
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  }
}

function normalizeMessagePackages(list) {
  if (!Array.isArray(list)) return []
  const now = Date.now()
  return list
    .map((item) => {
      if (!item || typeof item !== 'object' || !item.id) return null
      const expiresAt = item.expiresAt || null
      const expired = Boolean(expiresAt) && new Date(expiresAt).getTime() <= now
      const messages = Number(item.messages)
      return {
        id: String(item.id),
        packageId: String(item.packageId || ''),
        name: String(item.name || 'Paquete de mensajes TTC'),
        messages: Number.isFinite(messages) ? messages : 0,
        purchasedAt: item.purchasedAt || null,
        expiresAt,
        status: expired ? 'vencido' : 'activo',
      }
    })
    .filter(Boolean)
}

function normalizeDocumentNumber(value) {
  return String(value ?? '')
    .trim()
    .replace(/\D/g, '')
}

export async function updateSubscriptionProfile({ token, userId, patch, hint }) {
  await ensureSuperAdmin()
  const incoming = patch && typeof patch === 'object' ? { ...patch } : {}
  const sessionHint = {
    userId: hint?.userId || incoming.clientUserId,
    email: hint?.email || incoming.clientEmail,
  }
  delete incoming.clientUserId
  delete incoming.clientEmail
  patch = incoming

  const session = await resolveSubscriptionSession(token, sessionHint)
  if (!session?.user) {
    return { ok: false, status: 401, error: 'Sesión inválida o expirada.' }
  }

  const actor = session.user
  const targetId = userId && userId !== 'me' ? String(userId) : actor.id
  const isSelf = targetId === actor.id
  const actorRol = String(actor.rol ?? '').toLowerCase()
  const actorEmail = String(actor.email ?? '').toLowerCase()
  const actorIsSuper = isSuperAdminUser(actor)
  const canEditOthers = actorIsSuper || actorRol === 'admin'

  if (!isSelf && !canEditOthers) {
    return { ok: false, status: 403, error: 'No puede editar el perfil de otro usuario.' }
  }

  const store = await loadStore()
  const index = store.users.findIndex((item) => item.id === targetId)
  if (index === -1) {
    return { ok: false, status: 404, error: 'Usuario no encontrado.' }
  }
  const target = store.users[index]
  if (isMasterAccountEmail(target.email) && !actorIsSuper) {
    return {
      ok: false,
      status: 403,
      error: 'La cuenta del superadministrador no es modificable.',
    }
  }
  if (
    !isSelf &&
    !actorIsSuper &&
    actorRol === 'admin' &&
    String(target.clinicId || target.id) !== String(actor.clinicId || actor.id)
  ) {
    return { ok: false, status: 403, error: 'Ese usuario no pertenece a su clínica.' }
  }

  const current = store.users[index]
  const fiscalOnlyKeys = Object.keys(patch).filter((key) => patch[key] !== undefined)
  const isFiscalProfileOnlyPatch =
    fiscalOnlyKeys.length > 0 &&
    fiscalOnlyKeys.every((key) => key === 'perfilFiscal' || key === 'providerType') &&
    patch.perfilFiscal !== undefined

  if (isFiscalProfileOnlyPatch) {
    if (!(isClinicOwner(current) || canManageClinicTeam(actor))) {
      return {
        ok: false,
        status: 403,
        error: 'Solo el titular o el administrador de la clínica puede cambiar el perfil fiscal.',
      }
    }
    const nextPerfil = normalizePerfilFiscal(patch.perfilFiscal)
    const nextProviderType = isNoObligadoFev(nextPerfil)
      ? 'profesional_independiente'
      : normalizeProviderType(patch.providerType ?? current.providerType)
    const now = new Date().toISOString()
    const clinicId = clinicIdOf(current)
    const updated = {
      ...current,
      perfilFiscal: nextPerfil,
      providerType: nextProviderType,
      updatedAt: now,
    }
    store.users[index] = updated
    for (let i = 0; i < store.users.length; i++) {
      if (clinicIdOf(store.users[i]) !== clinicId) continue
      if (store.users[i].id === current.id) continue
      store.users[i] = {
        ...store.users[i],
        perfilFiscal: nextPerfil,
        updatedAt: now,
      }
    }
    await saveStore(store)
    return { ok: true, user: sanitizeUser(updated) }
  }

  const targetRole = normalizeRole(current.rol)
  const mustVerifyPrestador = targetRole !== 'recepcion'
  const providerType = normalizeProviderType(patch.providerType ?? current.providerType)
  const institution = isInstitutionProvider(providerType)

  const names = splitPersonName({
    firstName: String(patch.firstName !== undefined ? patch.firstName : current.firstName ?? '').trim(),
    lastName: String(patch.lastName !== undefined ? patch.lastName : current.lastName ?? '').trim(),
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
  const documentNumber = keepStoredDocumentNumber(
    current.documentNumber,
    patch.documentNumber ?? '',
    documentType,
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

  const rethusIncoming = String(patch.rethusNumber ?? '').trim()
  const rethusNumber = institution
    ? ''
    : (rethusIncoming || String(current.rethusNumber ?? ''))
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

  const legalName = institution
    ? String(patch.legalName ?? '').trim()
    : composeLegalName(firstName, lastName)
  const clinicName = String(patch.clinicName ?? '').trim() || (institution ? legalName : '')
  const providerNit = formatNitInput(patch.providerNit || '')
  const repsCode = sanitizeRepsInput(patch.repsCode || '')

  if (institution && !legalName) {
    return { ok: false, status: 400, error: 'La razón social de la IPS es obligatoria.' }
  }

  const nitCheck = validateProviderNit(providerNit)
  if (!nitCheck.valid) {
    return { ok: false, status: 400, error: nitCheck.message }
  }
  const repsCheck = parseRepsCodeWithDane(repsCode)
  if (!repsCheck.valid) {
    return { ok: false, status: 400, error: repsCheck.message }
  }
  const providerNitStored = nitCheck.display || providerNit
  const repsCodeStored = repsCheck.display || repsCode
  const clinicIdForReps = clinicIdOf(current)
  const repsOwner = store.users.find((item) => item.id === clinicIdForReps) || current
  const existingReps = new Set()
  const projectedReps = new Set()
  for (const member of usersInClinic(store, clinicIdForReps)) {
    const saved = repsDigits(member.repsCode)
    if (saved) existingReps.add(saved)
    const code = member.id === current.id ? repsCodeStored : member.repsCode
    const digits = repsDigits(code)
    if (digits) projectedReps.add(digits)
  }
  const repsCap = checkRepsLimit(repsOwner, projectedReps.size, existingReps.size)
  if (!repsCap.canAdd) {
    return { ok: false, status: 403, error: userLimitMessage(repsCap) }
  }
  if (!hasRethusCode(current) && hasRethusCode({ rethusNumber })) {
    const rethusLookup = await readClinicAssistantLimit(clinicIdForReps)
    const rethusAccount = applyClinicAssistantLookup(repsOwner, rethusLookup)
    const rethusUsed = usersInClinic(store, clinicIdForReps).filter(hasRethusCode).length
    const rethusError = rethusGainError(rethusAccount, rethusUsed)
    if (rethusError) return rethusError
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
      repsCode: repsCodeStored,
      providerNit: providerNitStored,
      clinicName: clinicName || legalName,
    })
    if (!claimed.ok) {
      return claimed
    }
  }

  let email = current.email
  const emailLocked = isSelf || normalizeEmail(current.email) === MASTER_EMAIL
  if (emailLocked && patch.email !== undefined) {
    const attempted = String(patch.email).trim().toLowerCase()
    if (attempted && attempted !== normalizeEmail(current.email)) {
      return {
        ok: false,
        status: 400,
        error: 'El correo de sesión no se modifica desde el perfil.',
      }
    }
  } else if (patch.email !== undefined) {
    const nextEmail = String(patch.email).trim().toLowerCase()
    if (nextEmail && nextEmail !== current.email) {
      if (nextEmail === MASTER_EMAIL) {
        return { ok: false, status: 403, error: 'Este correo está reservado para el administrador del sistema.' }
      }
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
    rethusStatus: institution ? undefined : (patch.rethusStatus ?? current.rethusStatus ?? (rethusNumber ? 'activo' : current.rethusStatus)),
    clinicName: clinicName || (institution ? legalName : ''),
    legalName: institution ? legalName : '',
    providerType,
    providerNit: providerNitStored,
    repsCode: repsCodeStored,
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

  if (patch.perfilFiscal !== undefined && (isClinicOwner(current) || canManageClinicTeam(actor))) {
    const nextPerfil = normalizePerfilFiscal(patch.perfilFiscal)
    const clinicId = clinicIdOf(current)
    updated.perfilFiscal = nextPerfil
    for (let i = 0; i < store.users.length; i++) {
      if (clinicIdOf(store.users[i]) !== clinicId) continue
      if (store.users[i].id === current.id) continue
      store.users[i] = {
        ...store.users[i],
        perfilFiscal: nextPerfil,
        updatedAt: now,
      }
    }
  } else {
    updated.perfilFiscal = normalizePerfilFiscal(current.perfilFiscal)
  }

  store.users[index] = updated
  await saveStore(store)
  return { ok: true, user: sanitizeUser(updated) }
}

/**
 * Guarda la cédula que ya está en la atención cuando el perfil la perdió.
 * No exige NIT ni REPS y no reemplaza una cédula distinta.
 */
export async function rememberProfessionalDocument({ token, hint, documentNumber, documentType }) {
  const session = await resolveSubscriptionSession(token, hint)
  if (!session?.user) {
    return { ok: false, status: 401, error: 'Sesión inválida o expirada.' }
  }

  const type = String(documentType || session.user.documentType || 'CC').trim() || 'CC'
  const check = validateProfessionalDocumentNumber(documentNumber, type)
  if (!check.valid || !check.normalized) {
    return {
      ok: false,
      status: 400,
      error: check.message || 'La cédula del profesional no es válida.',
    }
  }

  const store = await loadStore()
  const index = store.users.findIndex((item) => item.id === session.user.id)
  if (index === -1) {
    return { ok: false, status: 404, error: 'Usuario no encontrado.' }
  }

  const current = store.users[index]
  const existing = validateProfessionalDocumentNumber(current.documentNumber, current.documentType || type)
  if (existing.valid && existing.normalized && existing.normalized !== check.normalized) {
    return {
      ok: false,
      status: 409,
      error: 'El perfil ya tiene otra cédula. No se reemplaza con la de la atención.',
    }
  }

  const duplicate = store.users.find(
    (item) =>
      item.id !== current.id &&
      validateProfessionalDocumentNumber(item.documentNumber, item.documentType || 'CC').normalized ===
        check.normalized,
  )
  if (duplicate) {
    return { ok: false, status: 409, error: 'Ya existe un usuario con esta cédula.' }
  }

  if (existing.valid && existing.normalized === check.normalized) {
    return { ok: true, user: sanitizeUser(current), unchanged: true }
  }

  const updated = {
    ...current,
    documentType: type,
    documentNumber: check.normalized,
    updatedAt: new Date().toISOString(),
  }
  store.users[index] = updated
  await saveStore(store)
  return { ok: true, user: sanitizeUser(updated) }
}

export async function confirmOwnPassword({ token, password, hint }) {
  const session = await resolveSubscriptionSession(token, hint)
  if (!session?.user) {
    return { ok: false, status: 401, error: 'Sesión inválida o expirada.' }
  }

  const store = await loadStore()
  const current = store.users.find((item) => item.id === session.user.id)
  if (!current) {
    return { ok: false, status: 401, error: 'Sesión inválida o expirada.' }
  }

  if (!accountPasswordMatches(current, password)) {
    return { ok: false, status: 400, error: 'Contraseña incorrecta.' }
  }

  return { ok: true }
}

export async function changeOwnPassword({ token, currentPassword, newPassword, hint }) {
  const session = await resolveSubscriptionSession(token, hint)
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
  if (!accountPasswordMatches(current, currentPassword)) {
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

export async function startRethusTrial({ token, documentNumber, rethusNumber, hint }) {
  const session = await resolveSubscriptionSession(token, hint)
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
  return store.users
    .map((user) => {
      const refreshed = refreshPaymentStatus(user)
      const safe = sanitizeUser(refreshed)
      const phone = safe.phone_number || safe.phone || ''
      return {
        ...safe,
        planName: planDisplayName(safe.plan, safe.estado_pago),
        trialStartedAt: refreshed.trialStartedAt ?? null,
        trialUsedAt: refreshed.trialUsedAt ?? null,
        emailVerifiedAt: refreshed.emailVerifiedAt ?? null,
        subscriptionPaidAt: safe.subscriptionPaidAt ?? null,
        subscriptionPaidBy: safe.subscriptionPaidBy ?? null,
        // Campos explícitos para el panel de ventas del Superadmin.
        phone,
        phone_number: phone,
        whatsapp_verified: safe.whatsapp_verified === true,
        whatsapp_status: safe.whatsapp_status || (phone ? 'pending' : 'skipped'),
        registrationComplete: Boolean(refreshed.emailVerifiedAt || refreshed.passwordHash),
      }
    })
    .sort((a, b) => {
      const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0
      const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0
      return bTime - aTime
    })
}

/**
 * Borra por completo una cuenta de registro (store + OTP + Postgres usuarios).
 * No permite tocar la cuenta maestra.
 */
export async function deleteSubscriptionUserByEmail(email) {
  const normalizedEmail = normalizeEmail(email)
  if (!normalizedEmail) {
    return { ok: false, status: 400, error: 'Indique el correo a eliminar.' }
  }
  if (normalizedEmail === MASTER_EMAIL) {
    return { ok: false, status: 403, error: 'La cuenta del superadministrador no puede eliminarse.' }
  }

  const store = await loadStore()
  const index = store.users.findIndex((user) => user.email === normalizedEmail)
  if (index === -1) {
    return { ok: false, status: 404, error: 'No hay una cuenta con ese correo.' }
  }

  const removed = store.users[index]
  if (isSuperAdminUser(removed) || isMasterAccountEmail(removed.email)) {
    return { ok: false, status: 403, error: 'La cuenta del superadministrador no puede eliminarse.' }
  }

  store.users.splice(index, 1)
  store.sessions = (store.sessions || []).filter(
    (item) =>
      String(item.userId) !== String(removed.id) &&
      normalizeEmail(item.email) !== normalizedEmail,
  )
  store.emailVerifications = (store.emailVerifications || []).filter(
    (item) => item.email !== normalizedEmail,
  )
  await saveStore(store)

  // Limpieza secundaria en segundo plano: no debe tumbar el DELETE por timeout de nginx.
  const phone = normalizeColombiaPhoneNumber(removed.phone_number || removed.phone)
  setImmediate(() => {
    void (async () => {
      try {
        await deleteEmailOtp(normalizedEmail)
      } catch (error) {
        console.error(
          '[Auth] OTP correo no limpiado al borrar registro:',
          error instanceof Error ? error.message : error,
        )
      }
      if (phone) {
        try {
          await deletePhoneOtp(phone)
        } catch (error) {
          console.error(
            '[Auth] OTP WhatsApp no limpiado al borrar registro:',
            error instanceof Error ? error.message : error,
          )
        }
      }
      try {
        await withPgClient(async (client) => {
          await client.query(`DELETE FROM usuarios WHERE lower(email) = lower($1::text)`, [
            normalizedEmail,
          ])
        })
      } catch (error) {
        if (error?.code !== 'PG_UNAVAILABLE') {
          console.error(
            '[Auth] No se pudo borrar el usuario en Postgres:',
            error instanceof Error ? error.message : error,
          )
        }
      }
      try {
        const scope = clinicSyncAliasIds(removed)
        await resetClinicClinicalBucket(scope.canonical, scope.aliases)
      } catch (error) {
        console.error(
          '[Auth] No se pudo limpiar el cubo clínico al borrar el registro:',
          error instanceof Error ? error.message : error,
        )
      }
    })()
  })

  return {
    ok: true,
    email: normalizedEmail,
    id: removed.id,
  }
}

function clinicIdOf(user) {
  return String(user?.clinicId || user?.id || '')
}

function isClinicOwner(user) {
  if (!user?.id) return false
  return String(user.id) === clinicIdOf(user)
}

function canManageClinicTeam(user) {
  if (!user) return false
  if (isSuperAdminUser(user)) return true
  if (isClinicOwner(user)) return true
  return normalizeRole(user.rol) === 'admin'
}

function usersInClinic(store, clinicId) {
  const id = String(clinicId)
  return store.users.filter((item) => clinicIdOf(item) === id)
}

function hasClinicAccess(user) {
  return user?.accessEnabled !== false && Boolean(user?.passwordHash)
}

function repsDigits(value) {
  return String(value ?? '').replace(/\D/g, '')
}

function countRoleBuckets(members) {
  let assistantsUsed = 0
  let rethusUsed = 0
  const repsCodes = new Set()
  for (const member of members) {
    if (normalizeRole(member.rol) === 'recepcion') assistantsUsed += 1
    if (hasRethusCode(member)) rethusUsed += 1
    const digits = repsDigits(member.repsCode)
    if (digits) repsCodes.add(digits)
  }
  return { assistantsUsed, rethusUsed, repsUsed: repsCodes.size }
}

function rethusGainError(account, currentRethusUsers) {
  try {
    const result = checkRethusLimit(account, currentRethusUsers)
    const error = rethusLimitReachedMessage(result)
    if (!error) return null
    return { ok: false, status: 403, error }
  } catch (error) {
    return {
      ok: false,
      status: 400,
      error: error instanceof Error ? error.message : 'Plan de suscripción inválido',
    }
  }
}

async function clinicSeats(store, clinicId) {
  const owner = store.users.find((item) => item.id === clinicId) || null
  const lookup = await readClinicAssistantLimit(clinicId)
  const account = applyClinicAssistantLookup(owner ?? {}, lookup)
  const members = usersInClinic(store, clinicId)
  const active = members.filter(hasClinicAccess)
  const { assistantsUsed, rethusUsed, repsUsed } = countRoleBuckets(members)
  let rethus
  try {
    rethus = checkRethusLimit(owner ? account : null, rethusUsed)
  } catch (error) {
    rethus = {
      limit: 0,
      planName: error instanceof Error ? error.message : 'Plan de suscripción inválido',
    }
  }
  const reps = checkRepsLimit(account, repsUsed)
  return {
    clinicId,
    used: active.length,
    max: null,
    assistantsUsed,
    maxAssistants: null,
    rethusUsed,
    maxRethus: rethus.limit,
    repsUsed,
    maxReps: reps.limit,
    plan: owner?.plan ?? null,
    planName: rethus.planName || planDisplayName(owner?.plan, owner?.estado_pago),
    estado_pago: owner?.estado_pago ?? null,
  }
}

function publicClinicUser(user) {
  const safe = sanitizeUser(user)
  return {
    ...safe,
    email: safe.email || '',
    clinicId: clinicIdOf(user),
    isClinicOwner: isClinicOwner(user),
  }
}

export async function listClinicUsers({ token, hint }) {
  const session = await resolveSubscriptionSession(token, hint)
  if (!session?.user) {
    return { ok: false, status: 401, error: 'Sesión inválida o expirada.' }
  }
  if (!canManageClinicTeam(session.user)) {
    return {
      ok: false,
      status: 403,
      error: 'Solo el administrador de la clínica puede gestionar el equipo.',
    }
  }
  const store = await loadStore()
  const clinicId = clinicIdOf(session.user)
  const ownerIndex = store.users.findIndex((item) => item.id === clinicId)
  if (
    ownerIndex !== -1 &&
    !isSuperAdminUser(store.users[ownerIndex]) &&
    normalizeRole(store.users[ownerIndex].rol) !== 'admin'
  ) {
    store.users[ownerIndex] = {
      ...store.users[ownerIndex],
      rol: 'admin',
      clinicId,
      updatedAt: new Date().toISOString(),
    }
    await saveStore(store)
  }
  const seats = await clinicSeats(store, clinicId)
  const users = usersInClinic(store, clinicId).map(publicClinicUser)
  return { ok: true, users, seats }
}

export async function createClinicUser({ token, hint, member }) {
  const session = await resolveSubscriptionSession(token, hint)
  if (!session?.user) {
    return { ok: false, status: 401, error: 'Sesión inválida o expirada.' }
  }
  if (!canManageClinicTeam(session.user)) {
    return {
      ok: false,
      status: 403,
      error: 'Solo el administrador de la clínica puede crear colaboradores.',
    }
  }

  const password = String(member?.password ?? '')
  if (password.length < 8) {
    return { ok: false, status: 400, error: 'La contraseña debe tener al menos 8 caracteres.' }
  }

  const documentType = String(member?.documentType ?? 'CC').trim() || 'CC'
  const documentNumber = String(member?.documentNumber ?? '').replace(/\D/g, '')
  if (documentNumber.length < 6 || documentNumber.length > 12) {
    return {
      ok: false,
      status: 400,
      error: 'La cédula es obligatoria (6 a 12 dígitos) y es la llave de acceso del colaborador.',
    }
  }

  const requestedRole = normalizeRole(member?.rol ?? member?.role ?? 'odontologo')
  const role = requestedRole === 'superadmin' ? 'odontologo' : requestedRole
  if (!VALID_ROLES.has(role) || role === 'superadmin') {
    return { ok: false, status: 400, error: 'El rol indicado no está permitido.' }
  }

  const isAuxiliar = role === 'recepcion'
  let firstName = String(member?.firstName ?? '').trim()
  let lastName = String(member?.lastName ?? '').trim()
  const email = String(member?.email ?? '').trim().toLowerCase()
  if (isMasterAccountEmail(email)) {
    return {
      ok: false,
      status: 403,
      error: 'El correo del superadministrador no puede usarse en el equipo de la clínica.',
    }
  }
  const phone = normalizeStaffPhone(member?.phone)
  if (isAuxiliar) {
    if (!isLikelyEmail(email)) {
      return { ok: false, status: 400, error: 'El correo electrónico es obligatorio para auxiliares.' }
    }
    if (phone.length < 7 || phone.length > 12) {
      return { ok: false, status: 400, error: 'El teléfono es obligatorio para auxiliares (7 a 12 dígitos).' }
    }
    if (!firstName) firstName = 'Auxiliar'
    if (!lastName) lastName = 'Administrativo'
  } else if (!firstName || !lastName) {
    return { ok: false, status: 400, error: 'Nombres y apellidos son obligatorios.' }
  }

  const store = await loadStore()
  const clinicId = clinicIdOf(session.user)
  const owner = store.users.find((item) => item.id === clinicId) || store.users.find((item) => item.id === session.user.id)
  if (!owner) {
    return { ok: false, status: 404, error: 'No se encontró la cuenta de la clínica.' }
  }

  const rethusCode = String(
    member?.rethusNumber ?? member?.rethus_code ?? member?.rethusCode ?? '',
  ).trim()
  const administrative = isAuxiliar || !rethusCode
  if (!administrative) {
    const lookup = await readClinicAssistantLimit(clinicId)
    const account = applyClinicAssistantLookup(owner, lookup)
    const rethusUsed = usersInClinic(store, clinicId).filter(hasRethusCode).length
    const rethusError = rethusGainError(account, rethusUsed)
    if (rethusError) return rethusError
  }

  const duplicateDoc = store.users.find(
    (item) => normalizeDocumentNumber(item.documentNumber) === documentNumber,
  )
  if (duplicateDoc) {
    return { ok: false, status: 409, error: 'Ya existe un usuario con esta cédula.' }
  }

  if (email) {
    if (store.users.some((item) => normalizeEmail(item.email) === email)) {
      return { ok: false, status: 409, error: 'Ya existe un usuario con este correo.' }
    }
  }

  const now = new Date().toISOString()
  const user = {
    id: randomUUID(),
    firstName,
    lastName,
    nombre: [firstName, lastName].filter(Boolean).join(' '),
    email: email || '',
    phone,
    passwordHash: hashPasswordSha256(password),
    rol: role,
    documentType,
    documentNumber,
    rethusNumber: administrative ? '' : rethusCode,
    clinicId,
    clinicName: owner.clinicName || member?.clinicName || '',
    legalName: owner.legalName || '',
    providerType: owner.providerType || 'profesional_independiente',
    perfilFiscal: normalizePerfilFiscal(owner.perfilFiscal) || DEFAULT_PERFIL_FISCAL,
    providerNit: owner.providerNit || '',
    repsCode: owner.repsCode || '',
    repsStatus: owner.repsStatus || 'activo',
    thsSpecialty: member?.thsSpecialty || 'odontologia_general',
    plan: owner.plan || null,
    estado_pago: owner.estado_pago === 'exento' ? 'pendiente' : owner.estado_pago,
    fecha_vencimiento: owner.fecha_vencimiento || null,
    accessEnabled: true,
    createdAt: now,
    updatedAt: now,
  }
  store.users.push(user)
  await saveStore(store)
  return {
    ok: true,
    message: administrative
      ? 'Usuario administrativo creado'
      : 'Profesional agregado correctamente',
    user: publicClinicUser(user),
    seats: await clinicSeats(store, clinicId),
  }
}

export async function updateClinicUser({ token, hint, userId, patch }) {
  const session = await resolveSubscriptionSession(token, hint)
  if (!session?.user) {
    return { ok: false, status: 401, error: 'Sesión inválida o expirada.' }
  }
  if (!canManageClinicTeam(session.user)) {
    return { ok: false, status: 403, error: 'Solo el administrador de la clínica puede editar colaboradores.' }
  }
  const store = await loadStore()
  const clinicId = clinicIdOf(session.user)
  const index = store.users.findIndex((item) => item.id === userId)
  if (index === -1) {
    return { ok: false, status: 404, error: 'Usuario no encontrado.' }
  }
  const current = store.users[index]
  if (isMasterAccountEmail(current.email)) {
    return {
      ok: false,
      status: 403,
      error: 'La cuenta del superadministrador no es modificable desde la clínica.',
    }
  }
  if (clinicIdOf(current) !== clinicId && !isSuperAdminUser(session.user)) {
    return { ok: false, status: 403, error: 'Ese usuario no pertenece a su clínica.' }
  }

  const incoming = patch && typeof patch === 'object' ? { ...patch } : {}
  let firstName = String(incoming.firstName ?? current.firstName ?? '').trim()
  let lastName = String(incoming.lastName ?? current.lastName ?? '').trim()
  const documentNumber = incoming.documentNumber !== undefined
    ? String(incoming.documentNumber).replace(/\D/g, '')
    : normalizeDocumentNumber(current.documentNumber)
  if (documentNumber && (documentNumber.length < 6 || documentNumber.length > 12)) {
    return { ok: false, status: 400, error: 'La cédula debe tener entre 6 y 12 dígitos.' }
  }
  if (documentNumber) {
    const duplicate = store.users.find(
      (item) => item.id !== current.id && normalizeDocumentNumber(item.documentNumber) === documentNumber,
    )
    if (duplicate) {
      return { ok: false, status: 409, error: 'Ya existe otro usuario con esta cédula.' }
    }
  }

  let role = current.rol
  if (isClinicOwner(current) && !isSuperAdminUser(current)) {
    role = 'admin'
  } else if (incoming.role !== undefined || incoming.rol !== undefined) {
    const requested = normalizeRole(incoming.role ?? incoming.rol)
    if (requested === 'superadmin') {
      return { ok: false, status: 403, error: 'El rol de superadministrador no es asignable.' }
    }
    role = requested
  }

  const isAuxiliar = role === 'recepcion'
  const email = incoming.email !== undefined ? String(incoming.email ?? '').trim().toLowerCase() : current.email
  const phone = incoming.phone !== undefined
    ? normalizeStaffPhone(incoming.phone)
    : normalizeStaffPhone(current.phone)
  if (isAuxiliar) {
    if (!isLikelyEmail(email)) {
      return { ok: false, status: 400, error: 'El correo electrónico es obligatorio para auxiliares.' }
    }
    if (phone.length < 7 || phone.length > 12) {
      return { ok: false, status: 400, error: 'El teléfono es obligatorio para auxiliares (7 a 12 dígitos).' }
    }
    if (!firstName) firstName = current.firstName || 'Auxiliar'
    if (!lastName) lastName = current.lastName || 'Administrativo'
  } else if (!firstName || !lastName) {
    return { ok: false, status: 400, error: 'Nombres y apellidos son obligatorios.' }
  }

  const nextRethus = incoming.rethusNumber !== undefined
    ? String(incoming.rethusNumber).trim()
    : String(current.rethusNumber ?? '')
  if (!hasRethusCode(current) && hasRethusCode({ rethusNumber: nextRethus })) {
    const lookup = await readClinicAssistantLimit(clinicId)
    const owner = store.users.find((item) => item.id === clinicId) || null
    const account = applyClinicAssistantLookup(owner ?? {}, lookup)
    const rethusUsed = usersInClinic(store, clinicId).filter(hasRethusCode).length
    const rethusError = rethusGainError(owner ? account : null, rethusUsed)
    if (rethusError) return rethusError
  }

  store.users[index] = {
    ...current,
    firstName,
    lastName,
    nombre: [firstName, lastName].filter(Boolean).join(' '),
    email: email || '',
    phone,
    documentType: incoming.documentType ?? current.documentType ?? 'CC',
    documentNumber: documentNumber || current.documentNumber,
    rethusNumber: incoming.rethusNumber !== undefined ? String(incoming.rethusNumber).trim() : current.rethusNumber,
    rol: role,
    thsSpecialty: incoming.thsSpecialty ?? current.thsSpecialty,
    updatedAt: new Date().toISOString(),
  }
  await saveStore(store)
  return { ok: true, user: publicClinicUser(store.users[index]) }
}

export async function resetClinicUserPassword({ token, hint, userId, newPassword }) {
  const session = await resolveSubscriptionSession(token, hint)
  if (!session?.user) {
    return { ok: false, status: 401, error: 'Sesión inválida o expirada.' }
  }
  if (!canManageClinicTeam(session.user)) {
    return { ok: false, status: 403, error: 'Solo el administrador de la clínica puede asignar contraseñas.' }
  }
  const password = String(newPassword ?? '')
  if (password.length < 8) {
    return { ok: false, status: 400, error: 'La contraseña debe tener al menos 8 caracteres.' }
  }
  const store = await loadStore()
  const clinicId = clinicIdOf(session.user)
  const index = store.users.findIndex((item) => item.id === userId)
  if (index === -1) {
    return { ok: false, status: 404, error: 'Usuario no encontrado.' }
  }
  const current = store.users[index]
  if (isMasterAccountEmail(current.email) || isSuperAdminUser(current)) {
    return {
      ok: false,
      status: 403,
      error: 'La contraseña del superadministrador no se gestiona desde la clínica.',
    }
  }
  if (clinicIdOf(current) !== clinicId && !isSuperAdminUser(session.user)) {
    return { ok: false, status: 403, error: 'Ese usuario no pertenece a su clínica.' }
  }
  store.users[index] = {
    ...current,
    passwordHash: hashPasswordSha256(password),
    accessEnabled: true,
    updatedAt: new Date().toISOString(),
  }
  await saveStore(store)
  return { ok: true }
}

export async function deleteClinicUser({ token, hint, userId }) {
  const session = await resolveSubscriptionSession(token, hint)
  if (!session?.user) {
    return { ok: false, status: 401, error: 'Sesión inválida o expirada.' }
  }
  if (!canManageClinicTeam(session.user)) {
    return { ok: false, status: 403, error: 'Solo el administrador de la clínica puede eliminar colaboradores.' }
  }
  if (String(userId) === String(session.user.id)) {
    return { ok: false, status: 400, error: 'No puede eliminar su propio usuario.' }
  }
  const store = await loadStore()
  const clinicId = clinicIdOf(session.user)
  const index = store.users.findIndex((item) => item.id === userId)
  if (index === -1) {
    return { ok: false, status: 404, error: 'Usuario no encontrado.' }
  }
  const target = store.users[index]
  if (isMasterAccountEmail(target.email) || isSuperAdminUser(target)) {
    return {
      ok: false,
      status: 403,
      error: 'La cuenta del superadministrador no puede eliminarse.',
    }
  }
  if (clinicIdOf(target) !== clinicId && !isSuperAdminUser(session.user)) {
    return { ok: false, status: 403, error: 'Ese usuario no pertenece a su clínica.' }
  }
  if (isClinicOwner(target)) {
    return { ok: false, status: 400, error: 'No puede eliminar al titular de la clínica.' }
  }
  store.users[index] = {
    ...target,
    passwordHash: '',
    accessEnabled: false,
    updatedAt: new Date().toISOString(),
  }
  store.sessions = store.sessions.filter((item) => item.userId !== userId)
  await saveStore(store)
  return { ok: true, user: publicClinicUser(store.users[index]), seats: await clinicSeats(store, clinicId) }
}

export async function selectPaidPlan({ token, planId, hint }) {
  void token
  void planId
  void hint
  if (!SUBSCRIPTION_PURCHASES_ENABLED) {
    return { ok: false, status: 503, error: SUBSCRIPTION_PURCHASES_DISABLED_MESSAGE }
  }
  // Defensa: nunca activar solo por elegir plan. Solo el superadmin confirma el pago.
  return {
    ok: false,
    status: 403,
    error:
      'Sin prueba de pago no hay suscripción. Solo el superadministrador puede confirmar un pago de forma explícita.',
  }
}

function titularProductSnapshot(owner, actorId) {
  const safe = sanitizeUser(refreshPaymentStatus(owner))
  return {
    titular: {
      id: safe.id,
      nombre: safe.nombre,
      email: safe.email || '',
      documentNumber: safe.documentNumber || '',
      clinicName: safe.clinicName || '',
      isSelf: String(safe.id) === String(actorId),
    },
    plan: {
      id: safe.plan ?? null,
      estado_pago: safe.estado_pago,
      fecha_vencimiento: safe.fecha_vencimiento ?? null,
    },
    packages: safe.messagePackages ?? [],
    user: String(safe.id) === String(actorId) ? safe : undefined,
  }
}

async function loadTitularAccount(session, { requireManager = false } = {}) {
  if (!session?.user) {
    return { ok: false, status: 401, error: 'Sesión inválida o expirada.' }
  }
  if (requireManager && !canManageClinicTeam(session.user)) {
    return {
      ok: false,
      status: 403,
      error: 'Solo el titular de la clínica puede comprar planes y paquetes.',
    }
  }
  const store = await loadStore()
  const clinicId = clinicIdOf(session.user)
  const index = store.users.findIndex((item) => item.id === clinicId)
  if (index === -1) {
    return { ok: false, status: 404, error: 'No se encontró la cuenta del titular.' }
  }
  return {
    ok: true,
    store,
    index,
    owner: store.users[index],
    actorId: session.user.id,
    canPurchase: canManageClinicTeam(session.user),
  }
}

export async function readTitularProducts({ token, hint }) {
  const session = await resolveSubscriptionSession(token, hint)
  const loaded = await loadTitularAccount(session)
  if (!loaded.ok) return loaded
  return {
    ok: true,
    canPurchase: loaded.canPurchase,
    ...titularProductSnapshot(loaded.owner, loaded.actorId),
  }
}

export async function purchaseTitularPlan({ token, planId, hint }) {
  void token
  void planId
  void hint
  if (!SUBSCRIPTION_PURCHASES_ENABLED) {
    return { ok: false, status: 503, error: SUBSCRIPTION_PURCHASES_DISABLED_MESSAGE }
  }
  // Defensa: la compra self-serve no marca activo. Requiere confirmación del superadmin.
  return {
    ok: false,
    status: 403,
    error:
      'Sin prueba de pago no hay suscripción. Solo el superadministrador puede confirmar un pago de forma explícita.',
  }
}

export async function purchaseTitularMessagePackage({ token, packageId, hint }) {
  const session = await resolveSubscriptionSession(token, hint)
  const loaded = await loadTitularAccount(session, { requireManager: true })
  if (!loaded.ok) return loaded

  const pack = TTC_MESSAGE_PACKAGES.find((item) => item.id === String(packageId ?? '').trim())
  if (!pack) {
    return { ok: false, status: 400, error: 'Seleccione un paquete de mensajes TTC válido.' }
  }

  const now = new Date()
  const entry = {
    id: randomUUID(),
    packageId: pack.id,
    name: pack.name,
    messages: pack.messages,
    purchasedAt: now.toISOString(),
    expiresAt: addDays(now, pack.validityDays),
  }
  const updated = {
    ...loaded.owner,
    messagePackages: [
      ...(Array.isArray(loaded.owner.messagePackages) ? loaded.owner.messagePackages : []),
      entry,
    ],
    updatedAt: now.toISOString(),
  }
  loaded.store.users[loaded.index] = updated
  await saveStore(loaded.store)
  return {
    ok: true,
    message: `${pack.name} adquirido. Vence el ${formatProductDate(entry.expiresAt)}.`,
    ...titularProductSnapshot(updated, loaded.actorId),
  }
}

function formatProductDate(iso) {
  if (!iso) return 'sin fecha'
  return new Date(iso).toLocaleDateString('es-CO', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}



