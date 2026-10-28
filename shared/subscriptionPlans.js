export const PAID_PLANS = [
  {
    id: 'nomad',
    name: 'Nomad',
    priceLabel: '$50.000',
    period: 'COP/mes',
    blurb: 'Para el especialista independiente.',
    featured: false,
    cta: 'Comenzar',
    features: [
      '1 profesional ReTHUS · 1 sede REPS',
      '1 GB de almacenamiento',
      'Dictado por voz IA (2 horas/mes)',
      'WhatsApp manual ilimitado',
      'Compra de paquetes extra',
    ],
    maxSeats: 2,
    maxRethus: 1,
    maxReps: 1,
  },
  {
    id: 'smart',
    name: 'Smart',
    priceLabel: '$100.000',
    period: 'COP/mes',
    blurb: 'El equilibrio ideal para consultas en crecimiento.',
    featured: true,
    cta: 'Elegir Smart',
    features: [
      '4 profesionales ReTHUS · 1 sede REPS',
      '5 GB de almacenamiento',
      'Dictado por voz IA (15 horas/mes)',
      'WhatsApp manual ilimitado + 150 automáticos',
      'Facturación DIAN (50 facturas/mes)',
      'Compra de paquetes extra',
    ],
    maxSeats: 4,
    maxRethus: 4,
    maxReps: 1,
  },
  {
    id: 'bionic',
    name: 'BioniC',
    priceLabel: '$150.000',
    period: 'COP/mes',
    blurb: 'La suite definitiva.',
    featured: false,
    cta: 'Comenzar',
    features: [
      '6 profesionales ReTHUS · 1 sede REPS',
      '15 GB de almacenamiento',
      'Dictado por voz IA (35 horas/mes)',
      'WhatsApp manual ilimitado + 500 automáticos',
      'Facturación DIAN (100 facturas/mes)',
      'Compra de paquetes extra',
    ],
    maxSeats: 6,
    maxRethus: 6,
    maxReps: 1,
  },
  {
    id: 'corporativo',
    name: 'Corporativo',
    priceLabel: 'Hablemos',
    period: '',
    blurb: 'Para clínicas de alto volumen o múltiples sedes.',
    featured: false,
    cta: 'Hablemos',
    features: [
      'Profesionales ReTHUS a medida · 1 sede REPS',
      'Paquetes WhatsApp mayorista',
      'Facturación DIAN por volumen',
      'Capacitación presencial',
      'Gerente de cuenta asignado',
    ],
    maxSeats: 100,
    maxRethus: 'custom',
    maxReps: 1,
  },
]

export const PAID_PLAN_IDS = PAID_PLANS.map((plan) => plan.id)

export const TRIAL_DAYS = 7
export const PAID_PLAN_DAYS = 30
export const TRIAL_SEAT_LIMIT = 2

/** Paquetes adicionales de mensajes TTC. La vigencia corre desde la compra. */
export const TTC_MESSAGE_PACKAGES = [
  {
    id: 'ttc-150',
    name: 'Mensajes TTC 150',
    messages: 150,
    priceLabel: '$25.000',
    period: 'COP',
    validityDays: 30,
    blurb: '150 mensajes TTC para recordatorios y avisos a pacientes.',
  },
  {
    id: 'ttc-500',
    name: 'Mensajes TTC 500',
    messages: 500,
    priceLabel: '$70.000',
    period: 'COP',
    validityDays: 30,
    blurb: '500 mensajes TTC para consultas con más volumen de avisos.',
  },
  {
    id: 'ttc-1500',
    name: 'Mensajes TTC 1.500',
    messages: 1500,
    priceLabel: '$180.000',
    period: 'COP',
    validityDays: 30,
    blurb: '1.500 mensajes TTC para clínicas de alto volumen.',
  },
]

export const TTC_MESSAGE_PACKAGE_IDS = TTC_MESSAGE_PACKAGES.map((item) => item.id)

export const PLAN_SEAT_LIMITS = Object.fromEntries(
  PAID_PLANS.map((plan) => [plan.id, plan.maxSeats]),
)

export const CORPORATE_PLAN_ID = 'corporativo'
export const CUSTOM_PLAN_LIMIT = 'custom'

export const PLAN_LIMITS = {
  nomad: { name: 'Plan Nomad', maxRethus: 1, maxReps: 1 },
  smart: { name: 'Plan Smart', maxRethus: 4, maxReps: 1 },
  bionic: { name: 'Plan Bionic', maxRethus: 6, maxReps: 1 },
  corporativo: { name: 'Plan Corporativo', maxRethus: 'custom', maxReps: 1 },
  prueba: { name: 'Prueba', maxRethus: 1, maxReps: 1 },
}

export function isCorporatePlan(plan) {
  return String(plan ?? '').trim().toLowerCase() === CORPORATE_PLAN_ID
}

/** Entero ≥ 0, o `null` si el valor no es un tope manual válido. */
export function normalizeCustomMaxAssistants(value) {
  if (value == null || value === '') return null
  const number = typeof value === 'number' ? value : Number(String(value).trim())
  if (!Number.isInteger(number) || number < 0) return null
  return number
}

/**
 * Si la fila de `clinics` existe, sus columnas pisan lo guardado en la cuenta.
 * Sin fila (o sin Postgres) se conservan los valores de la cuenta.
 */
export function applyClinicAssistantLookup(account = {}, lookup) {
  if (!lookup?.found) return account
  const assistants = Object.prototype.hasOwnProperty.call(lookup, 'custom_max_assistants')
    ? lookup.custom_max_assistants
    : (lookup.value ?? null)
  const rethus = Object.prototype.hasOwnProperty.call(lookup, 'custom_max_rethus')
    ? lookup.custom_max_rethus
    : (account.customMaxRethus ?? account.custom_max_rethus ?? null)
  return {
    ...account,
    customMaxAssistants: assistants ?? null,
    custom_max_assistants: assistants ?? null,
    customMaxRethus: rethus ?? null,
    custom_max_rethus: rethus ?? null,
  }
}

function isUnlimitedAccount(account = {}) {
  const estado = String(account.estado_pago ?? '').toLowerCase()
  const rol = String(account.rol ?? account.role ?? '').toLowerCase()
  return estado === 'exento' || rol === 'superadmin'
}

function planDetailsFor(account = {}) {
  const estado = String(account.estado_pago ?? '').toLowerCase()
  if (estado === 'prueba') return PLAN_LIMITS.prueba
  const plan = String(account.plan ?? account.subscription_plan ?? '').toLowerCase()
  if (PLAN_LIMITS[plan]) return PLAN_LIMITS[plan]
  if (estado === 'activo') return PLAN_LIMITS.nomad
  return PLAN_LIMITS.prueba
}

/** Equivale a `rethus_code IS NOT NULL` en la tabla de usuarios. */
export function hasRethusCode(user) {
  const value = user?.rethusNumber ?? user?.rethus_code ?? user?.rethusCode
  return String(value ?? '').trim() !== ''
}

/**
 * Cupo de odontólogos con código ReTHUS.
 * Corporativo lee custom_max_rethus (vacío = 0). Un código vacío no cuenta.
 */
export function checkRethusLimit(clinic, currentRethusUsers) {
  if (!clinic || typeof clinic !== 'object') {
    throw new Error('Clínica no encontrada')
  }
  const current = Number(currentRethusUsers) || 0
  if (isUnlimitedAccount(clinic)) {
    return { canAdd: true, current, limit: null, planName: 'Exento' }
  }
  const estado = String(clinic.estado_pago ?? '').toLowerCase()
  const planKey = String(clinic.subscription_plan ?? clinic.plan ?? '').trim().toLowerCase()
  const planDetails = estado === 'prueba' ? PLAN_LIMITS.prueba : PLAN_LIMITS[planKey]
  if (!planDetails) {
    throw new Error('Plan de suscripción inválido')
  }
  let maxAllowed = planDetails.maxRethus
  if (maxAllowed === CUSTOM_PLAN_LIMIT) {
    maxAllowed = normalizeCustomMaxAssistants(
      clinic.custom_max_rethus ?? clinic.customMaxRethus,
    ) || 0
  }
  return {
    canAdd: current < maxAllowed,
    current,
    limit: maxAllowed,
    planName: planDetails.name,
  }
}

/** Un auxiliar, o quien no lleva código ReTHUS, no entra en este cupo. */
export function checkUserLimits(account = {}, isAssistant, currentUsers) {
  if (isAssistant) {
    return {
      canAdd: true,
      current: Number(currentUsers) || 0,
      limit: null,
      planName: isUnlimitedAccount(account) ? 'Exento' : planDetailsFor(account).name,
      userType: 'Auxiliares',
    }
  }
  const result = checkRethusLimit(account, currentUsers)
  return { ...result, userType: 'Profesionales (ReTHUS)' }
}

/**
 * Sedes REPS. Hoy todos los planes, incluido Corporativo, permiten 1.
 * `projectedSedes` ya incluye la sede que se quiere dejar guardada.
 * Si la clínica ya superaba el tope, se puede guardar sin agregar otra sede.
 */
export function checkRepsLimit(account = {}, projectedSedes, previousSedes = 0) {
  const current = Number(projectedSedes) || 0
  const previous = Number(previousSedes) || 0
  if (isUnlimitedAccount(account)) {
    return { canAdd: true, current, limit: null, planName: 'Exento', userType: 'Sedes REPS' }
  }
  const planDetails = planDetailsFor(account)
  let maxAllowed = planDetails.maxReps
  if (maxAllowed === CUSTOM_PLAN_LIMIT) {
    maxAllowed = normalizeCustomMaxAssistants(account.custom_max_reps ?? account.customMaxReps) || 0
  }
  const within = current <= maxAllowed
  const growing = current > previous
  return {
    canAdd: within || !growing,
    current,
    limit: maxAllowed,
    planName: planDetails.name,
    userType: 'Sedes REPS',
  }
}

export function userLimitMessage(result) {
  if (!result || result.canAdd || result.limit == null) return null
  let noun = 'profesionales (ReTHUS)'
  if (result.userType === 'Auxiliares') noun = 'auxiliares'
  if (result.userType === 'Sedes REPS') noun = Number(result.limit) === 1 ? 'sede REPS' : 'sedes REPS'
  return `${result.planName} permite máximo ${result.limit} ${noun}. Actualmente tiene ${result.current}.`
}

/** Aviso del alta cuando el profesional con ReTHUS no cabe en el plan. */
export function rethusLimitReachedMessage(limitCheck) {
  if (!limitCheck || limitCheck.canAdd || limitCheck.limit == null) return null
  return `Límite alcanzado. Tu ${limitCheck.planName} permite hasta ${limitCheck.limit} profesionales (ReTHUS). Por favor, actualiza tu plan.`
}

export function snapshotLimitError(seats, isAssistant) {
  if (isAssistant) return null
  const current = Number(seats?.rethusUsed) || 0
  const limit = seats?.maxRethus
  const result = {
    canAdd: limit == null || current < limit,
    current,
    limit: limit ?? null,
    planName: seats?.planName || 'su plan',
    userType: 'Profesionales (ReTHUS)',
  }
  return rethusLimitReachedMessage(result)
}

/** `null` = sin tope (cuenta exenta / superadmin). */
export function seatLimitForAccount(account = {}) {
  const estado = String(account.estado_pago ?? '').toLowerCase()
  const rol = String(account.rol ?? '').toLowerCase()
  if (estado === 'exento' || rol === 'superadmin') return null
  if (estado === 'prueba') return TRIAL_SEAT_LIMIT
  const plan = String(account.plan ?? '').toLowerCase()
  if (PLAN_SEAT_LIMITS[plan] != null) return PLAN_SEAT_LIMITS[plan]
  if (estado === 'activo') return PLAN_SEAT_LIMITS.nomad
  return TRIAL_SEAT_LIMIT
}

export function planDisplayName(plan, estadoPago) {
  if (String(estadoPago ?? '').toLowerCase() === 'prueba') return 'Prueba'
  const match = PAID_PLANS.find((item) => item.id === String(plan ?? '').toLowerCase())
  return match?.name || 'su plan'
}
