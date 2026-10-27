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
      '2 Usuarios (Doctor + Auxiliar)',
      '1 GB de almacenamiento',
      'Dictado por voz IA (2 horas/mes)',
      'WhatsApp manual ilimitado',
      'Compra de paquetes extra',
    ],
    maxSeats: 2,
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
      'Hasta 4 Usuarios',
      '5 GB de almacenamiento',
      'Dictado por voz IA (15 horas/mes)',
      'WhatsApp manual ilimitado + 150 automáticos',
      'Facturación DIAN (50 facturas/mes)',
      'Compra de paquetes extra',
    ],
    maxSeats: 4,
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
      'Hasta 6 Usuarios',
      '15 GB de almacenamiento',
      'Dictado por voz IA (35 horas/mes)',
      'WhatsApp manual ilimitado + 500 automáticos',
      'Facturación DIAN (100 facturas/mes)',
      'Compra de paquetes extra',
    ],
    maxSeats: 6,
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
      'Usuarios y almacenamiento a medida',
      'Paquetes WhatsApp mayorista',
      'Facturación DIAN por volumen',
      'Capacitación presencial',
      'Gerente de cuenta asignado',
    ],
    maxSeats: 100,
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
 * Si la fila de `clinics` existe, su columna pisa el valor guardado en la cuenta.
 * Sin fila (o sin Postgres) se conserva el valor de la cuenta.
 */
export function applyClinicAssistantLookup(account = {}, lookup) {
  if (!lookup?.found) return account
  const value = lookup.value ?? null
  return {
    ...account,
    customMaxAssistants: value,
    custom_max_assistants: value,
  }
}

/**
 * Tope manual de auxiliares. Solo el plan corporativo.
 * Prueba, exento y superadmin no lo usan. `null` = la columna no aplica.
 */
export function customMaxAssistantsForAccount(account = {}) {
  const estado = String(account.estado_pago ?? '').toLowerCase()
  const rol = String(account.rol ?? account.role ?? '').toLowerCase()
  if (estado === 'exento' || rol === 'superadmin') return null
  if (estado === 'prueba') return null
  if (!isCorporatePlan(account.plan)) return null
  return normalizeCustomMaxAssistants(
    account.customMaxAssistants ?? account.custom_max_assistants,
  )
}

export function assistantLimitMessage(max, used) {
  return `El plan Corporativo permite máximo ${max} auxiliares. Actualmente tiene ${used}. Este límite es manual y exclusivo del plan corporativo.`
}

/** `null` si se puede agregar el auxiliar o el tope no aplica. */
export function assistantLimitError(maxAssistants, assistantsUsed, becomingAssistant = true) {
  if (!becomingAssistant || maxAssistants == null) return null
  if (assistantsUsed >= maxAssistants) return assistantLimitMessage(maxAssistants, assistantsUsed)
  return null
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
