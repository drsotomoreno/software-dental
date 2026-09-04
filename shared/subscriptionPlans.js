export const PAID_PLANS = [
  {
    id: 'nomad',
    name: 'Nomad',
    priceLabel: '$50.000',
    period: 'COP/mes',
    blurb: 'Para el especialista independiente.',
    featured: false,
    features: [
      'Pacientes ilimitados',
      'Dictado por voz sin tope por casilla',
      '2 usuarios (doctor + auxiliar)',
      'WhatsApp y RIPS',
    ],
    maxSeats: 2,
  },
  {
    id: 'smart',
    name: 'Smart',
    priceLabel: '$100.000',
    period: 'COP/mes',
    blurb: 'El equilibrio para consultas en crecimiento.',
    featured: true,
    features: [
      'Pacientes ilimitados',
      'Dictado por voz IA ampliado',
      'Hasta 5 colaboradores',
      'Firma Ley 527 y exportación RIPS',
      'Soporte prioritario',
    ],
    maxSeats: 5,
  },
  {
    id: 'bionic',
    name: 'BioniC',
    priceLabel: '$150.000',
    period: 'COP/mes',
    blurb: 'Para clínicas que facturan y operan en equipo.',
    featured: false,
    features: [
      'Multi-profesional',
      'Hasta 15 colaboradores',
      'Facturación electrónica',
      'FHIR y portabilidad',
      'Administración central',
    ],
    maxSeats: 15,
  },
  {
    id: 'corporativo',
    name: 'Corporativo',
    priceLabel: 'A convenir',
    period: '',
    blurb: 'Redes y grupos odontológicos.',
    featured: false,
    features: [
      'Usuarios y sedes a medida',
      'Hasta 100 colaboradores',
      'Integraciones y SLA',
      'Acompañamiento de implantación',
      'Volúmenes de folios DIAN',
    ],
    maxSeats: 100,
  },
]

export const PAID_PLAN_IDS = PAID_PLANS.map((plan) => plan.id)

export const TRIAL_DAYS = 7
export const PAID_PLAN_DAYS = 30
export const TRIAL_SEAT_LIMIT = 2

export const PLAN_SEAT_LIMITS = Object.fromEntries(
  PAID_PLANS.map((plan) => [plan.id, plan.maxSeats]),
)

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
