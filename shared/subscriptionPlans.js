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
      '1 profesional ReTHUS + 1 auxiliar',
      '1 GB de almacenamiento',
      'Dictado por voz IA (2 horas/mes)',
      'WhatsApp manual ilimitado',
      'Compra de paquetes extra',
    ],
    maxSeats: 2,
    maxRethus: 1,
    maxAssistants: 1,
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
      '3 profesionales ReTHUS + 1 auxiliar',
      '5 GB de almacenamiento',
      'Dictado por voz IA (15 horas/mes)',
      'WhatsApp manual ilimitado + 150 automáticos',
      'Facturación DIAN (50 facturas/mes)',
      'Compra de paquetes extra',
    ],
    maxSeats: 4,
    maxRethus: 3,
    maxAssistants: 1,
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
      '5 profesionales ReTHUS + 1 auxiliar',
      '15 GB de almacenamiento',
      'Dictado por voz IA (35 horas/mes)',
      'WhatsApp manual ilimitado + 500 automáticos',
      'Facturación DIAN (100 facturas/mes)',
      'Compra de paquetes extra',
    ],
    maxSeats: 6,
    maxRethus: 5,
    maxAssistants: 1,
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
      'Profesionales ReTHUS y auxiliares a medida',
      'Paquetes WhatsApp mayorista',
      'Facturación DIAN por volumen',
      'Capacitación presencial',
      'Gerente de cuenta asignado',
    ],
    maxSeats: 100,
    maxRethus: 'custom',
    maxAssistants: 'custom',
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

export const PLAN_LIMITS = Object.fromEntries(
  PAID_PLANS.map((plan) => [
    plan.id,
    { name: plan.name, maxRethus: plan.maxRethus, maxAssistants: plan.maxAssistants },
  ]),
)
PLAN_LIMITS.prueba = { name: 'Prueba', maxRethus: 1, maxAssistants: 1 }

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

/**
 * Cupo según el rol que se está creando.
 * Auxiliar: cuenta auxiliares contra maxAssistants.
 * Profesional: cuenta ReTHUS contra maxRethus.
 * En Corporativo el catálogo vale 'custom' y se lee la columna de la clínica (vacío = 0).
 */
export function checkUserLimits(account = {}, isAssistant, currentUsers) {
  const current = Number(currentUsers) || 0
  const userType = isAssistant ? 'Auxiliares' : 'Profesionales (ReTHUS)'
  if (isUnlimitedAccount(account)) {
    return { canAdd: true, current, limit: null, planName: 'Exento', userType }
  }
  const planDetails = planDetailsFor(account)
  let maxAllowed = isAssistant ? planDetails.maxAssistants : planDetails.maxRethus
  if (maxAllowed === CUSTOM_PLAN_LIMIT) {
    const raw = isAssistant
      ? (account.custom_max_assistants ?? account.customMaxAssistants)
      : (account.custom_max_rethus ?? account.customMaxRethus)
    maxAllowed = normalizeCustomMaxAssistants(raw) || 0
  }
  return {
    canAdd: current < maxAllowed,
    current,
    limit: maxAllowed,
    planName: planDetails.name,
    userType,
  }
}

export function userLimitMessage(result) {
  if (!result || result.canAdd || result.limit == null) return null
  const noun = result.userType === 'Auxiliares' ? 'auxiliares' : 'profesionales (ReTHUS)'
  return `Su plan ${result.planName} permite máximo ${result.limit} ${noun}. Actualmente tiene ${result.current}.`
}

export function snapshotLimitError(seats, isAssistant) {
  const current = Number(isAssistant ? seats?.assistantsUsed : seats?.rethusUsed) || 0
  const limit = isAssistant ? seats?.maxAssistants : seats?.maxRethus
  const result = {
    canAdd: limit == null || current < limit,
    current,
    limit: limit ?? null,
    planName: seats?.planName || 'su plan',
    userType: isAssistant ? 'Auxiliares' : 'Profesionales (ReTHUS)',
  }
  if (result.canAdd) return null
  return userLimitMessage(result)
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
