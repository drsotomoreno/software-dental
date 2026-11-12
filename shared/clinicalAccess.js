import { PAID_PLAN_IDS } from './subscriptionPlans.js'

/** Cuenta maestra. Ningún otro correo, rol o estado_pago abre el software completo. */
export const MASTER_ACCESS_EMAIL = 'doctormauriciosoto@gmail.com'

export const TRIAL_MAX_PATIENTS = 1

const PAID_PLAN_SET = new Set(PAID_PLAN_IDS)

export function normalizeAccessEmail(email) {
  return String(email ?? '').trim().toLowerCase()
}

export function isMasterAccessEmail(email) {
  return normalizeAccessEmail(email) === MASTER_ACCESS_EMAIL
}

function expiryInFuture(value) {
  if (!value) return false
  const time = new Date(value).getTime()
  return Number.isFinite(time) && time > Date.now()
}

/**
 * Prueba de pago: solo la confirmación explícita del superadmin (o pasarela futura)
 * deja `subscriptionPaidAt`. Sin ese sello no hay suscripción pagada.
 */
export function hasSubscriptionPaymentProof(user) {
  const paidAt = user?.subscriptionPaidAt
  if (paidAt == null || paidAt === '') return false
  const time = new Date(paidAt).getTime()
  return Number.isFinite(time)
}

/**
 * full: suscripción pagada vigente (plan + fecha + prueba de pago) o la cuenta maestra.
 * trial: prueba gratuita vigente. Un paciente.
 * none: sin derecho a historias clínicas.
 * `exento`, `activo` sin plan, `activo` sin pago confirmado o el rol superadmin no cuentan.
 */
export function clinicalAccessTier(user) {
  if (!user) return 'none'
  if (isMasterAccessEmail(user.email)) return 'full'

  const estado = String(user.estado_pago ?? '').trim().toLowerCase()
  if (!expiryInFuture(user.fecha_vencimiento)) return 'none'
  if (estado === 'prueba') return 'trial'
  if (
    estado === 'activo' &&
    PAID_PLAN_SET.has(String(user.plan ?? '').trim().toLowerCase()) &&
    hasSubscriptionPaymentProof(user)
  ) {
    return 'full'
  }
  return 'none'
}

/**
 * Corrige el almacén: un correo que no es el maestro no conserva exento
 * ni un activo sin plan pagado y sin prueba de pago. Así no vuelve a entrar quien no pagó.
 */
export function applyStoredAccessPolicy(user) {
  const isMaster = isMasterAccessEmail(user?.email)
  let rol = String(user?.rol ?? 'odontologo').trim().toLowerCase()
  if (rol === 'administrador') rol = 'admin'
  if (rol === 'auxiliar' || rol === 'assistant') rol = 'recepcion'
  if (!['admin', 'odontologo', 'recepcion', 'superadmin'].includes(rol)) rol = 'odontologo'

  if (isMaster) {
    return {
      rol: 'superadmin',
      estado_pago: 'exento',
      plan: 'exento',
      fecha_vencimiento: user?.fecha_vencimiento ?? null,
      subscriptionPaidAt: null,
    }
  }

  if (rol === 'superadmin') rol = 'admin'

  let estado = String(user?.estado_pago ?? 'pendiente').trim().toLowerCase()
  let plan = user?.plan ?? null
  let fecha = user?.fecha_vencimiento ?? null
  let subscriptionPaidAt = hasSubscriptionPaymentProof(user) ? user.subscriptionPaidAt : null
  const planId = String(plan ?? '').trim().toLowerCase()
  const paid =
    estado === 'activo' && PAID_PLAN_SET.has(planId) && Boolean(subscriptionPaidAt)

  if (estado === 'exento' || (estado === 'activo' && !paid)) {
    estado = 'pendiente'
    plan = null
    fecha = null
    subscriptionPaidAt = null
  }

  return {
    rol,
    estado_pago: estado,
    plan,
    fecha_vencimiento: fecha,
    subscriptionPaidAt,
  }
}

function rememberPatient(ids, value) {
  if (value == null || value === '') return
  ids.add(String(value))
}

/** Pacientes distintos que un push intenta guardar. La prueba no puede pasar de uno. */
export function countDistinctClinicalPatients(body) {
  const source = body && typeof body === 'object' ? body : {}
  const ids = new Set()
  const lists = [
    source.patients,
    source.clinicalRecords,
    source.appointments,
    source.odontograms,
    source.diagnosticAids,
    source.attachments,
    source.drafts,
  ]
  for (const list of lists) {
    if (!Array.isArray(list)) continue
    for (const row of list) {
      if (!row || typeof row !== 'object') continue
      const before = ids.size
      rememberPatient(ids, row.id && list === source.patients ? row.id : null)
      rememberPatient(ids, row.patientId)
      rememberPatient(ids, row.patientSyncId)
      rememberPatient(ids, row.patient_id)
      if (list === source.patients && ids.size === before) {
        ids.add(`patient-${ids.size}`)
      }
    }
  }
  return ids.size
}
