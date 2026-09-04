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
      'Firma Ley 527 y exportación RIPS',
      'Soporte prioritario',
    ],
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
      'Facturación electrónica',
      'FHIR y portabilidad',
      'Administración central',
    ],
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
      'Integraciones y SLA',
      'Acompañamiento de implantación',
      'Volúmenes de folios DIAN',
    ],
  },
]

export const PAID_PLAN_IDS = PAID_PLANS.map((plan) => plan.id)

export const TRIAL_DAYS = 7
export const PAID_PLAN_DAYS = 30
