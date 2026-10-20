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
