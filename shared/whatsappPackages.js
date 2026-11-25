/**
 * Catálogo prepago exclusivo de WhatsApp / Chatbot.
 * Solo clínicas con suscripción paga activa (no free_trial).
 */

export const WHATSAPP_PACKAGE_TYPES = Object.freeze({
  REMINDERS: 'reminders',
  CHATBOT: 'chatbot',
})

/** @typedef {{ id: string, name: string, type: 'reminders'|'chatbot', credits: number, bonusCredits: number, amountCOP: number, priceLabel: string, blurb: string }} WhatsappPackage */

/** @type {WhatsappPackage[]} */
export const WHATSAPP_PACKAGES = [
  {
    id: 'REMINDERS_50',
    name: '50 Recordatorios',
    type: WHATSAPP_PACKAGE_TYPES.REMINDERS,
    credits: 50,
    bonusCredits: 0,
    amountCOP: 20000,
    priceLabel: '$20.000',
    blurb: '50 recordatorios automáticos (48h / 24h) por WhatsApp.',
  },
  {
    id: 'REMINDERS_150',
    name: '150 Recordatorios',
    type: WHATSAPP_PACKAGE_TYPES.REMINDERS,
    credits: 150,
    bonusCredits: 25,
    amountCOP: 50000,
    priceLabel: '$50.000',
    blurb: '150 recordatorios (+25 gratis) para agendas con más volumen.',
  },
  {
    id: 'CHATBOT_200',
    name: '200 Sesiones Chatbot',
    type: WHATSAPP_PACKAGE_TYPES.CHATBOT,
    credits: 200,
    bonusCredits: 0,
    amountCOP: 20000,
    priceLabel: '$20.000',
    blurb: '200 sesiones de chatbot (ventana de servicio 24h).',
  },
  {
    id: 'CHATBOT_600',
    name: '600 Sesiones Chatbot',
    type: WHATSAPP_PACKAGE_TYPES.CHATBOT,
    credits: 600,
    bonusCredits: 100,
    amountCOP: 50000,
    priceLabel: '$50.000',
    blurb: '600 sesiones de chatbot (+100 gratis).',
  },
]

export const WHATSAPP_PACKAGE_IDS = WHATSAPP_PACKAGES.map((pack) => pack.id)

/**
 * @param {string|null|undefined} packageId
 * @returns {WhatsappPackage|null}
 */
export function getWhatsappPackageById(packageId) {
  const id = String(packageId ?? '')
    .trim()
    .toUpperCase()
  return WHATSAPP_PACKAGES.find((pack) => pack.id === id) || null
}

/**
 * Créditos a sumar al saldo de la clínica.
 * El total es `credits` (p. ej. 150 / 600). `bonusCredits` es solo marketing
 * (“25 gratis” / “100 gratis” incluidos en ese total).
 */
export function creditsForWhatsappPackage(pack) {
  if (!pack) return 0
  return Math.max(0, Number(pack.credits) || 0)
}

/**
 * ¿Suscripción paga activa según el modelo real del producto?
 * Spec: subscription_status === 'active' && plan_type !== 'free_trial'
 * Runtime: estado_pago activo/gracia/exento + plan distinto de prueba.
 *
 * @param {object|null|undefined} user
 */
export function hasActivePaidSubscription(user) {
  if (!user || typeof user !== 'object') return false

  const email = String(user.email || '')
    .trim()
    .toLowerCase()
  if (email === 'doctormauriciosoto@gmail.com') return true
  if (user.is_superadmin === true || user.isSuperAdmin === true) return true

  const estado = String(user.estado_pago || user.subscription_status || '')
    .trim()
    .toLowerCase()
  const plan = String(user.plan || user.plan_type || user.subscription_plan || '')
    .trim()
    .toLowerCase()

  if (estado === 'prueba' || plan === 'free_trial' || plan === 'trial') return false

  if (estado === 'exento') return true

  if (estado === 'active' || estado === 'activo' || estado === 'pendiente_renovacion') {
    const expiresAt = user.fecha_vencimiento || user.expiresAt || user.subscription_expires_at
    if (!expiresAt) {
      // Activo sin fecha: solo si hay prueba de pago explícita o plan pago conocido.
      return Boolean(user.boldPaymentId || user.paymentConfirmedAt || plan)
    }
    return new Date(expiresAt).getTime() > Date.now()
  }

  return false
}

/**
 * Snapshot normalizado para APIs del módulo WhatsApp.
 * @param {object|null|undefined} user
 */
export function whatsappSubscriptionSnapshot(user) {
  const estado = String(user?.estado_pago || '')
    .trim()
    .toLowerCase()
  const plan = String(user?.plan || '')
    .trim()
    .toLowerCase()
  const paid = hasActivePaidSubscription(user)

  let subscription_status = 'inactive'
  let plan_type = plan || 'none'

  if (estado === 'prueba' || plan === 'free_trial') {
    subscription_status = 'trial'
    plan_type = 'free_trial'
  } else if (paid) {
    subscription_status = 'active'
    plan_type = plan || 'paid'
  } else if (estado === 'pendiente_renovacion') {
    subscription_status = 'past_due'
  } else if (estado === 'vencido') {
    subscription_status = 'expired'
  }

  return {
    subscription_status,
    plan_type,
    paid_subscription_active: paid,
    estado_pago: user?.estado_pago ?? null,
    plan: user?.plan ?? null,
    fecha_vencimiento: user?.fecha_vencimiento ?? null,
  }
}
