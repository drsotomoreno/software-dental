import type { PaymentMethod } from '@/types/clinicalRecord'
import type { OdontologyThsSpecialtyId } from '@/constants/ripsThsSpecialty'
import { DIAN_CONSUMIDOR_FINAL } from '@/constants/dianFiscalResponsibility'

export type CheckoutDocumentKind = 'internal_receipt' | 'electronic_invoice'

export const CHECKOUT_FOLIO_DEPLETED_MESSAGE = 'Te has quedado sin folios.'

export interface CheckoutBuyerForm {
  documentType: string
  documentNumber: string
  email: string
  fiscalResponsibility: string
}

export type CheckoutLineKind = 'cups' | 'aesthetic'

export interface CheckoutLineItem {
  id: string
  kind: CheckoutLineKind
  name: string
  cupsCode?: string | null
  quantity: number
  unitPrice: number
  totalAmount: number
  ripsGroup: 'procedimientos' | 'otrosServicios'
  sourceType: 'evolution' | 'budget' | 'manual_aesthetic'
  sourceId?: string
}

export type ConsultationCheckoutStatus =
  | 'idle'
  | 'validating'
  | 'blocked_rips'
  | 'blocked_folios'
  | 'submitting'
  | 'success'
  | 'error'

export interface RipsShieldMismatch {
  itemId: string
  cupsCode: string
  cupsName: string
  requiredSpecialtyId: OdontologyThsSpecialtyId
  requiredSpecialtyLabel: string
  clinicSpecialtyIds: OdontologyThsSpecialtyId[]
  clinicSpecialtyLabel: string
}

export interface RipsShieldState {
  open: boolean
  mismatches: RipsShieldMismatch[]
}

export interface ConsultationCheckoutState {
  sessionId: string
  patientId: string
  patientRequestsFev: boolean
  buyer: CheckoutBuyerForm
  cart: CheckoutLineItem[]
  paymentMethod: PaymentMethod
  amountToCollect: number
  foliosAvailable: number
  status: ConsultationCheckoutStatus
  shield: RipsShieldState | null
  folioGate: { open: boolean } | null
  lastError: string | null
}

export interface RegisterPaymentPayload {
  documentKind: CheckoutDocumentKind
  buyer: CheckoutBuyerForm
  cart: CheckoutLineItem[]
  amount: number
  paymentMethod: PaymentMethod
}

export function resolveCheckoutDocumentKind(
  patientRequestsFev: boolean,
): CheckoutDocumentKind {
  return patientRequestsFev ? 'electronic_invoice' : 'internal_receipt'
}

export function sumCheckoutCart(cart: CheckoutLineItem[]): number {
  return cart.reduce((sum, item) => sum + Math.max(0, item.totalAmount || 0), 0)
}

export function createEmptyCheckoutBuyer(
  defaults?: Partial<CheckoutBuyerForm>,
): CheckoutBuyerForm {
  return {
    documentType: defaults?.documentType?.trim() || 'CC',
    documentNumber: defaults?.documentNumber?.trim() || '',
    email: defaults?.email?.trim() || '',
    fiscalResponsibility: defaults?.fiscalResponsibility?.trim() || DIAN_CONSUMIDOR_FINAL,
  }
}

export function assertFevEqualsRips(cart: CheckoutLineItem[]): { ok: boolean; dianTotal: number; ripsTotal: number } {
  const dianTotal = sumCheckoutCart(cart)
  const ripsTotal = cart
    .filter((item) => item.ripsGroup === 'procedimientos' || item.ripsGroup === 'otrosServicios')
    .reduce((sum, item) => sum + Math.max(0, item.totalAmount || 0), 0)
  return { ok: dianTotal === ripsTotal, dianTotal, ripsTotal }
}
