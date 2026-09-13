import { useCallback, useEffect, useMemo, useState } from 'react'
import type { BudgetLineItem, PaymentMethod } from '@/types/clinicalRecord'
import type { EvolutionNote } from '@/types/evolutionNote'
import type { UserProfile } from '@/types/user'
import {
  assertFevEqualsRips,
  createEmptyCheckoutBuyer,
  resolveCheckoutDocumentKind,
  sumCheckoutCart,
  type CheckoutBuyerForm,
  type CheckoutLineItem,
  type ConsultationCheckoutState,
  type RegisterPaymentPayload,
} from '@/types/consultationCheckout'
import {
  BILLING_SETTINGS_CHANGED_EVENT,
  getFoliosAvailable,
} from '@/services/billingModalityService'
import { evaluateCheckoutRipsShield } from '@/utils/ripsShieldValidation'
import {
  buildCheckoutCartFromSources,
  createAestheticCheckoutLine,
} from '@/utils/consultationCheckoutCart'

interface UseConsultationCheckoutInput {
  sessionId?: string
  patientId?: string
  patientDocumentType?: string
  patientDocumentNumber?: string
  patientEmail?: string
  evolutionNotes?: EvolutionNote[]
  budgetItems?: BudgetLineItem[]
  professional?: UserProfile | null
}

const INITIAL_STATUS: ConsultationCheckoutState['status'] = 'idle'

export function useConsultationCheckout({
  sessionId = '',
  patientId = '',
  patientDocumentType,
  patientDocumentNumber,
  patientEmail,
  evolutionNotes,
  budgetItems,
  professional,
}: UseConsultationCheckoutInput) {
  const sourceCart = useMemo(
    () => buildCheckoutCartFromSources({ evolutionNotes, budgetItems }),
    [evolutionNotes, budgetItems],
  )
  const [manualLines, setManualLines] = useState<CheckoutLineItem[]>([])
  const [removedIds, setRemovedIds] = useState<string[]>([])
  const [patientRequestsFev, setPatientRequestsFev] = useState(false)
  const [buyer, setBuyer] = useState<CheckoutBuyerForm>(() =>
    createEmptyCheckoutBuyer({
      documentType: patientDocumentType,
      documentNumber: patientDocumentNumber,
      email: patientEmail,
    }),
  )
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('contado')
  const [foliosAvailable, setFoliosAvailable] = useState(() => getFoliosAvailable())
  const [status, setStatus] = useState<ConsultationCheckoutState['status']>(INITIAL_STATUS)
  const [folioGateOpen, setFolioGateOpen] = useState(false)
  const [lastError, setLastError] = useState<string | null>(null)

  useEffect(() => {
    setBuyer((current) => ({
      ...current,
      documentType: patientDocumentType?.trim() || current.documentType,
      documentNumber: patientDocumentNumber?.trim() || current.documentNumber,
      email: patientEmail?.trim() || current.email,
    }))
  }, [patientDocumentType, patientDocumentNumber, patientEmail])

  useEffect(() => {
    const refresh = () => setFoliosAvailable(getFoliosAvailable())
    window.addEventListener(BILLING_SETTINGS_CHANGED_EVENT, refresh)
    return () => window.removeEventListener(BILLING_SETTINGS_CHANGED_EVENT, refresh)
  }, [])

  const cart = useMemo(() => {
    const fromSources = sourceCart.filter((item) => !removedIds.includes(item.id))
    return [...fromSources, ...manualLines]
  }, [sourceCart, manualLines, removedIds])

  const amountToCollect = sumCheckoutCart(cart)
  const shieldMismatches = useMemo(
    () => (professional ? evaluateCheckoutRipsShield(cart, professional) : []),
    [cart, professional],
  )

  const state: ConsultationCheckoutState = {
    sessionId,
    patientId,
    patientRequestsFev,
    buyer,
    cart,
    paymentMethod,
    amountToCollect,
    foliosAvailable,
    status,
    shield: shieldMismatches.length > 0 ? { open: status === 'blocked_rips', mismatches: shieldMismatches } : null,
    folioGate: folioGateOpen ? { open: true } : null,
    lastError,
  }

  const addAestheticLine = useCallback((name: string, unitPrice: number) => {
    setManualLines((current) => [...current, createAestheticCheckoutLine(name, unitPrice)])
  }, [])

  const removeLine = useCallback((id: string) => {
    setRemovedIds((current) => (current.includes(id) ? current : [...current, id]))
    setManualLines((current) => current.filter((item) => item.id !== id))
  }, [])

  const chooseInternalReceipt = useCallback(() => {
    setPatientRequestsFev(false)
    setFolioGateOpen(false)
    setLastError(null)
    setStatus('idle')
  }, [])

  const setFevRequested = useCallback((requested: boolean) => {
    setPatientRequestsFev(requested)
    setLastError(null)
    if (!requested) setFolioGateOpen(false)
  }, [])

  const closeShield = useCallback(() => {
    setStatus('idle')
  }, [])

  const closeFolioGate = useCallback(() => {
    setFolioGateOpen(false)
    setStatus('idle')
  }, [])

  const prepareRegisterPayment = useCallback((): RegisterPaymentPayload | null => {
    setLastError(null)
    setStatus('validating')

    if (cart.length === 0 || amountToCollect <= 0) {
      setStatus('error')
      setLastError('Agregue al menos un procedimiento o servicio con valor para registrar el pago.')
      return null
    }

    if (shieldMismatches.length > 0) {
      setStatus('blocked_rips')
      return null
    }

    const equality = assertFevEqualsRips(cart)
    if (!equality.ok) {
      setStatus('error')
      setLastError(
        `El total DIAN (${equality.dianTotal}) no coincide con la suma RIPS (${equality.ripsTotal}).`,
      )
      return null
    }

    if (patientRequestsFev) {
      if (!buyer.documentType.trim() || !buyer.documentNumber.trim()) {
        setStatus('error')
        setLastError('Complete el tipo y número de documento del paciente para la factura electrónica.')
        return null
      }
      const available = getFoliosAvailable()
      setFoliosAvailable(available)
      if (available <= 0) {
        setStatus('blocked_folios')
        setFolioGateOpen(true)
        return null
      }
    }

    setStatus('submitting')
    return {
      documentKind: resolveCheckoutDocumentKind(patientRequestsFev),
      buyer,
      cart,
      amount: amountToCollect,
      paymentMethod,
    }
  }, [amountToCollect, buyer, cart, patientRequestsFev, paymentMethod, shieldMismatches.length])

  const markSuccess = useCallback((message?: string) => {
    setStatus('success')
    setLastError(message ?? null)
    setFolioGateOpen(false)
    setFoliosAvailable(getFoliosAvailable())
  }, [])

  const markError = useCallback((message: string) => {
    setStatus('error')
    setLastError(message)
  }, [])

  return {
    state,
    setBuyer,
    setPaymentMethod,
    addAestheticLine,
    removeLine,
    chooseInternalReceipt,
    setFevRequested,
    closeShield,
    closeFolioGate,
    prepareRegisterPayment,
    markSuccess,
    markError,
  }
}
