export type WhatsappPackageType = 'reminders' | 'chatbot'

export type WhatsappPackage = {
  id: string
  name: string
  type: WhatsappPackageType
  credits: number
  bonusCredits: number
  amountCOP: number
  priceLabel: string
  blurb: string
}

export const WHATSAPP_PACKAGE_TYPES: Readonly<{
  REMINDERS: 'reminders'
  CHATBOT: 'chatbot'
}>

export const WHATSAPP_PACKAGES: WhatsappPackage[]
export const WHATSAPP_PACKAGE_IDS: string[]

export function getWhatsappPackageById(packageId?: string | null): WhatsappPackage | null
export function creditsForWhatsappPackage(pack?: WhatsappPackage | null): number
export function hasActivePaidSubscription(user?: object | null): boolean
export function whatsappSubscriptionSnapshot(user?: object | null): {
  subscription_status: string
  plan_type: string
  paid_subscription_active: boolean
  estado_pago: string | null
  plan: string | null
  fecha_vencimiento: string | null
}
