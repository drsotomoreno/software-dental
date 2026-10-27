/**
 * Topes de equipo por plan.
 * `custom` no tiene tope automático: se acuerda con la clínica.
 * maxReps queda en 1 en todos los planes, incluido Corporativo.
 */
export const PLAN_LIMITS = {
  nomad: {
    name: 'Plan Nomad',
    maxRethus: 1,
    maxAssistants: 1,
    maxReps: 1,
  },
  smart: {
    name: 'Plan Smart',
    maxRethus: 4,
    maxAssistants: 2,
    maxReps: 1,
  },
  bionic: {
    name: 'Plan Bionic',
    maxRethus: 6,
    maxAssistants: 3,
    maxReps: 1,
  },
  corporativo: {
    name: 'Plan Corporativo',
    maxRethus: 'custom',
    maxAssistants: 'custom',
    maxReps: 1,
  },
}

function numericPlanLimit(value) {
  if (value === 'custom' || value == null) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function totalSeats(limits) {
  const rethus = numericPlanLimit(limits.maxRethus)
  const assistants = numericPlanLimit(limits.maxAssistants)
  if (rethus == null || assistants == null) return null
  return rethus + assistants
}

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
    maxRethus: PLAN_LIMITS.nomad.maxRethus,
    maxAssistants: PLAN_LIMITS.nomad.maxAssistants,
    maxReps: PLAN_LIMITS.nomad.maxReps,
    maxSeats: totalSeats(PLAN_LIMITS.nomad),
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
      'Hasta 4 profesionales ReTHUS y 2 auxiliares',
      '5 GB de almacenamiento',
      'Dictado por voz IA (15 horas/mes)',
      'WhatsApp manual ilimitado + 150 automáticos',
      'Facturación DIAN (50 facturas/mes)',
      'Compra de paquetes extra',
    ],
    maxRethus: PLAN_LIMITS.smart.maxRethus,
    maxAssistants: PLAN_LIMITS.smart.maxAssistants,
    maxReps: PLAN_LIMITS.smart.maxReps,
    maxSeats: totalSeats(PLAN_LIMITS.smart),
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
      'Hasta 6 profesionales ReTHUS y 3 auxiliares',
      '15 GB de almacenamiento',
      'Dictado por voz IA (35 horas/mes)',
      'WhatsApp manual ilimitado + 500 automáticos',
      'Facturación DIAN (100 facturas/mes)',
      'Compra de paquetes extra',
    ],
    maxRethus: PLAN_LIMITS.bionic.maxRethus,
    maxAssistants: PLAN_LIMITS.bionic.maxAssistants,
    maxReps: PLAN_LIMITS.bionic.maxReps,
    maxSeats: totalSeats(PLAN_LIMITS.bionic),
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
      'Profesionales ReTHUS, auxiliares y almacenamiento a medida',
      'Paquetes WhatsApp mayorista',
      'Facturación DIAN por volumen',
      'Capacitación presencial',
      'Gerente de cuenta asignado',
    ],
    maxRethus: PLAN_LIMITS.corporativo.maxRethus,
    maxAssistants: PLAN_LIMITS.corporativo.maxAssistants,
    maxReps: PLAN_LIMITS.corporativo.maxReps,
    maxSeats: totalSeats(PLAN_LIMITS.corporativo),
  },
]

export const PAID_PLAN_IDS = PAID_PLANS.map((plan) => plan.id)

export const TRIAL_DAYS = 7
export const PAID_PLAN_DAYS = 30
/** La prueba usa los mismos cupos que Nomad: 1 ReTHUS + 1 auxiliar. */
export const TRIAL_SEAT_LIMIT = totalSeats(PLAN_LIMITS.nomad)

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

/**
 * Cupos resueltos para una cuenta. `null` = sin tope.
 * Prueba y un plan activo desconocido usan Nomad.
 */
export function planLimitsForAccount(account = {}) {
  const estado = String(account.estado_pago ?? '').toLowerCase()
  const rol = String(account.rol ?? account.role ?? '').toLowerCase()
  if (estado === 'exento' || rol === 'superadmin') {
    return { maxRethus: null, maxAssistants: null, maxReps: null }
  }
  const plan = String(account.plan ?? '').toLowerCase()
  const limits = PLAN_LIMITS[plan] || PLAN_LIMITS.nomad
  return {
    maxRethus: numericPlanLimit(limits.maxRethus),
    maxAssistants: numericPlanLimit(limits.maxAssistants),
    maxReps: numericPlanLimit(limits.maxReps),
  }
}

/** `null` = sin tope (cuenta exenta, superadmin o plan a medida). */
export function seatLimitForAccount(account = {}) {
  const limits = planLimitsForAccount(account)
  if (limits.maxRethus == null || limits.maxAssistants == null) return null
  return limits.maxRethus + limits.maxAssistants
}

export function isAssistantRole(role) {
  const value = String(role ?? '').trim().toLowerCase()
  return value === 'recepcion' || value === 'auxiliar'
}

export function countStaffSeats(members, roleOf = (member) => member.rol ?? member.role) {
  let rethus = 0
  let assistants = 0
  for (const member of members) {
    const role = String(roleOf(member) ?? '').trim().toLowerCase()
    if (role === 'superadmin') continue
    if (isAssistantRole(role)) assistants += 1
    else rethus += 1
  }
  return { rethus, assistants }
}

export function describeStaffLimit(kind, used, max, planName) {
  if (max == null || used < max) return null
  const noun = kind === 'assistant'
    ? (max === 1 ? 'auxiliar' : 'auxiliares')
    : (max === 1 ? 'profesional con ReTHUS' : 'profesionales con ReTHUS')
  const more = kind === 'assistant' ? 'auxiliares' : 'profesionales'
  return `Su plan ${planName} permite máximo ${max} ${noun}. Actualmente tiene ${used}. Mejore el plan para agregar más ${more}.`
}

/** Rechaza el alta o el cambio de rol si ese cupo ya está lleno. `ignoreId` excluye al usuario que se edita. */
export function staffSeatBlock({ members, role, planName, limits, ignoreId }) {
  const counted = ignoreId == null
    ? members
    : members.filter((member) => String(member.id) !== String(ignoreId))
  const counts = countStaffSeats(counted)
  if (isAssistantRole(role)) {
    return describeStaffLimit('assistant', counts.assistants, limits.maxAssistants, planName)
  }
  if (String(role ?? '').trim().toLowerCase() === 'superadmin') return null
  return describeStaffLimit('rethus', counts.rethus, limits.maxRethus, planName)
}

export function planDisplayName(plan, estadoPago) {
  if (String(estadoPago ?? '').toLowerCase() === 'prueba') return 'Prueba'
  const match = PAID_PLANS.find((item) => item.id === String(plan ?? '').toLowerCase())
  return match?.name || 'su plan'
}
