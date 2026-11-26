import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getStoredApiAuth } from '@/services/apiAuthService'
import {
  getPaidPlanById,
  isBoldCheckoutPlan,
  normalizePaidPlanId,
} from '@/services/subscriptionService'

function checkoutReturnPath(planId: string) {
  return `/subscription-plans?plan=${encodeURIComponent(planId)}&checkout=1`
}

function authQueryForPlan(planId: string) {
  return new URLSearchParams({ plan: planId, checkout: '1' }).toString()
}

const BOLD_SCRIPT_SRC = 'https://checkout.bold.co/library/boldPaymentButton.js'
const CHECKOUT_INTENT_KEY = 'mhd.bold.checkoutIntent'

type BoldIntegrityResponse = {
  success?: boolean
  ok?: boolean
  error?: string
  orderId: string
  /** String entero firmado en el backend (mismo valor que va a BoldCheckout). */
  amount: string | number
  currency: string
  integritySignature: string
  apiKey: string
  description: string
}

type BoldCheckoutCtor = new (config: Record<string, string>) => { open: () => void }

type CheckoutIntent = {
  planId: string
  acceptedTerms: boolean
  createdAt: number
}

declare global {
  interface Window {
    BoldCheckout?: BoldCheckoutCtor
  }
}

let boldScriptPromise: Promise<void> | null = null

function formatCop(amount: number) {
  return new Intl.NumberFormat('es-CO').format(amount)
}

function loadBoldScript(): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Bold solo está disponible en el navegador.'))
  }
  if (window.BoldCheckout) return Promise.resolve()
  if (boldScriptPromise) return boldScriptPromise

  boldScriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${BOLD_SCRIPT_SRC}"]`)
    if (existing) {
      if (window.BoldCheckout) {
        resolve()
        return
      }
      existing.addEventListener('load', () => resolve(), { once: true })
      existing.addEventListener(
        'error',
        () => reject(new Error('No se pudo cargar el script de Bold.')),
        { once: true },
      )
      return
    }

    const script = document.createElement('script')
    script.src = BOLD_SCRIPT_SRC
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('No se pudo cargar el script de Bold.'))
    document.head.appendChild(script)
  }).catch((error: unknown) => {
    boldScriptPromise = null
    return Promise.reject(error)
  })

  return boldScriptPromise
}

function readCheckoutIntent(): CheckoutIntent | null {
  try {
    const raw = sessionStorage.getItem(CHECKOUT_INTENT_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as CheckoutIntent
    const planId = normalizePaidPlanId(parsed?.planId)
    if (!planId || !isBoldCheckoutPlan(planId)) return null
    return {
      planId,
      acceptedTerms: parsed.acceptedTerms === true,
      createdAt: Number(parsed.createdAt) || Date.now(),
    }
  } catch {
    return null
  }
}

function writeCheckoutIntent(intent: CheckoutIntent) {
  try {
    sessionStorage.setItem(CHECKOUT_INTENT_KEY, JSON.stringify(intent))
  } catch {
    /* ignore quota / private mode */
  }
}

function clearCheckoutIntent() {
  try {
    sessionStorage.removeItem(CHECKOUT_INTENT_KEY)
  } catch {
    /* ignore */
  }
}

async function requestIntegrity(planId: string): Promise<BoldIntegrityResponse> {
  const auth = getStoredApiAuth()
  const response = await fetch('/api/payments/bold/integrity', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(auth?.token ? { Authorization: `Bearer ${auth.token}` } : {}),
      ...(auth?.user?.email ? { 'X-Client-Email': String(auth.user.email) } : {}),
      ...(auth?.user?.id ? { 'X-Client-User-Id': String(auth.user.id) } : {}),
    },
    body: JSON.stringify({ planId }),
  })
  const payload = (await response.json().catch(() => ({}))) as BoldIntegrityResponse
  if (!response.ok || !payload.orderId || !payload.integritySignature || !payload.apiKey) {
    throw new Error(payload.error || 'No se pudo preparar el pago con Bold.')
  }
  return payload
}

export interface BoldCheckoutButtonProps {
  planId: string
  planName?: string
  disabled?: boolean
  className?: string
  label?: string
  /** Texto auxiliar claro/oscuro en tarjetas featured. */
  mutedClassName?: string
  /**
   * Cuota ya pagada del compromiso anual (0 = primera compra).
   * El botón muestra "Pagar Cuota (N+1)/12" cuando 1 ≤ N < 12.
   */
  paidInstallmentNumber?: number | null
  /**
   * Tras login: abrir Bold automáticamente si hay consentimiento guardado
   * (`?checkout=1` + sessionStorage).
   */
  autoCheckout?: boolean
}

/**
 * Botón de Pagos Bold: suscripción anual, cuota mensual con autorización del suscriptor, IVA excluido.
 * No envía `tax` al SDK (Bold trata el cobro sin IVA / 0 % al omitirlo).
 *
 * Payload hacia BoldCheckout (obligatorio si hay amount):
 * orderId + amount (entero COP) + currency=COP + apiKey + integritySignature (SHA-256).
 */
export function BoldCheckoutButton({
  planId: planIdProp,
  planName,
  disabled = false,
  className = '',
  label,
  mutedClassName = 'text-slate-500',
  paidInstallmentNumber = null,
  autoCheckout = false,
}: BoldCheckoutButtonProps) {
  const navigate = useNavigate()
  const planId = normalizePaidPlanId(planIdProp)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const [authGateOpen, setAuthGateOpen] = useState(false)
  const autoStartedRef = useRef(false)

  const plan = useMemo(() => getPaidPlanById(planId), [planId])
  const amountCOP = typeof plan?.amountCOP === 'number' ? plan.amountCOP : 0
  const amountLabel = amountCOP > 0 ? `$${formatCop(amountCOP)}` : plan?.priceLabel || ''
  const paidInstallments = Number(paidInstallmentNumber) || 0
  const nextInstallment =
    paidInstallments >= 1 && paidInstallments < 12
      ? paidInstallments + 1
      : paidInstallments >= 12
        ? 1
        : 1
  const inAnnualCommitment = paidInstallments >= 1 && paidInstallments < 12

  const openBoldCheckout = useCallback(async () => {
    if (!isBoldCheckoutPlan(planId)) {
      throw new Error('Este plan no tiene checkout en línea.')
    }

    await loadBoldScript()
    if (!window.BoldCheckout) {
      throw new Error('La librería BoldCheckout no está disponible.')
    }

    const integrity = await requestIntegrity(planId)
    // Exactamente el mismo string firmado en el backend (sin recalcular).
    const amount = String(integrity.amount ?? '')
      .trim()
      .replace(/\D/g, '')
    if (!amount || amount === '0') {
      throw new Error('Monto Bold inválido.')
    }
    const currency = String(integrity.currency || 'COP')
      .trim()
      .toUpperCase()
    if (currency !== 'COP') {
      throw new Error('La moneda del pago debe ser COP.')
    }
    const orderId = String(integrity.orderId || '')
      .trim()
      .replace(/[^a-zA-Z0-9_-]/g, '')
    if (!orderId) {
      throw new Error('Identificador de orden Bold inválido.')
    }
    const apiKey = String(integrity.apiKey || '').trim()
    const integritySignature = String(integrity.integritySignature || '')
      .trim()
      .toLowerCase()
    if (!apiKey || !integritySignature || integritySignature.length !== 64) {
      throw new Error('Firma de integridad Bold inválida.')
    }

    const redirectionUrl = `${window.location.origin}/subscription-plans?pago=procesando&plan=${encodeURIComponent(planId)}`

    const boldConfig = {
      orderId,
      currency: 'COP',
      amount,
      apiKey,
      integritySignature,
      description: String(integrity.description || '').trim(),
      redirectionUrl,
    }

    if (import.meta.env.DEV) {
      console.log('[BoldCheckout] params', {
        orderId: boldConfig.orderId,
        currency: boldConfig.currency,
        amount: boldConfig.amount,
        apiKeyPrefix: boldConfig.apiKey.slice(0, 6) + '…',
        description: boldConfig.description,
        redirectionUrl: boldConfig.redirectionUrl,
        integritySignatureLen: boldConfig.integritySignature.length,
      })
    }

    // Sin `tax`: Bold procesa sin IVA (equivalente a Excluido / 0 % Art. 476 ET).
    const checkout = new window.BoldCheckout(boldConfig)
    clearCheckoutIntent()
    checkout.open()
  }, [planId])

  const handleClick = useCallback(async () => {
    setError('')
    if (!isBoldCheckoutPlan(planId)) {
      setError('Este plan no tiene checkout en línea.')
      return
    }
    if (!acceptedTerms) {
      setError('Debe aceptar los términos y el débito mensual recurrente para continuar.')
      return
    }

    const auth = getStoredApiAuth()
    if (!auth?.token) {
      writeCheckoutIntent({
        planId,
        acceptedTerms: true,
        createdAt: Date.now(),
      })
      setAuthGateOpen(true)
      return
    }

    setBusy(true)
    try {
      await openBoldCheckout()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo abrir el pago Bold.')
    } finally {
      setBusy(false)
    }
  }, [acceptedTerms, openBoldCheckout, planId])

  const goToAuth = useCallback(
    (mode: 'register' | 'login') => {
      writeCheckoutIntent({
        planId,
        acceptedTerms: true,
        createdAt: Date.now(),
      })
      const q = authQueryForPlan(planId)
      const returnPath = checkoutReturnPath(planId)
      const path = mode === 'register' ? `/registro?${q}` : `/login?${q}`
      setAuthGateOpen(false)
      navigate(path, {
        state: {
          from: returnPath,
          boldCheckout: true,
        },
      })
    },
    [navigate, planId],
  )

  useEffect(() => {
    if (!autoCheckout || autoStartedRef.current || disabled) return
    const intent = readCheckoutIntent()
    if (!intent || intent.planId !== planId || !intent.acceptedTerms) return
    if (!getStoredApiAuth()?.token) return

    autoStartedRef.current = true
    setAcceptedTerms(true)
    setBusy(true)
    setError('')
    void openBoldCheckout()
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'No se pudo abrir el pago Bold.')
      })
      .finally(() => {
        setBusy(false)
      })
  }, [autoCheckout, disabled, openBoldCheckout, planId])

  const defaultLabel = inAnnualCommitment
    ? `Pagar Cuota ${nextInstallment}/12 con Bold (${amountLabel} COP)`
    : planName
      ? `Pagar ${planName}`
      : 'Pagar con Bold'
  const buttonLabel = label || (busy ? 'Abriendo Bold…' : defaultLabel)

  const consentId = `bold-consent-${planId}`

  return (
    <div className="space-y-3" data-bold-plan={planId}>
      {amountCOP > 0 ? (
        <div className={`space-y-1 text-center text-xs leading-relaxed ${mutedClassName}`}>
          <p className="font-semibold">
            {amountLabel} COP / mes ({plan?.taxLabel || 'Excluido de IVA - Art. 476 ET'})
          </p>
          {inAnnualCommitment ? (
            <p className="font-medium text-dental-800">
              Cuota {nextInstallment} de 12 del compromiso anual
            </p>
          ) : (
            <p>
              Suscripción anual con pago mensual vía Bold (compromiso mínimo de 12 meses; cada
              cuota requiere su autorización).
            </p>
          )}
        </div>
      ) : null}

      <label
        htmlFor={consentId}
        className={`flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 bg-white/80 px-3 py-2 text-left text-xs leading-snug text-slate-700 ${
          disabled ? 'opacity-60' : ''
        }`}
      >
        <input
          id={consentId}
          type="checkbox"
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-dental-700 focus:ring-dental-500"
          checked={acceptedTerms}
          disabled={disabled || busy}
          onChange={(event) => {
            setAcceptedTerms(event.target.checked)
            setError('')
          }}
        />
        <span>
          Acepto los{' '}
          <a
            href="/terminos#suscripcion-anual"
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-dental-700 underline underline-offset-2 hover:text-dental-800"
            onClick={(event) => event.stopPropagation()}
          >
            Términos del Servicio
          </a>{' '}
          (cláusula de suscripción anual, compromiso mínimo de 12 meses y pago mensual con Bold —
          Excluido de IVA, Art. 476 ET) y autorizo el cobro de{' '}
          <strong>{amountLabel} COP</strong>
          {inAnnualCommitment ? ` (Cuota ${nextInstallment}/12)` : ''} con Botón de Pagos Bold a
          favor de DOCTORSEOLABS S.A.S. (NIT 902127432).
        </span>
      </label>

      <button
        type="button"
        disabled={disabled || busy || !acceptedTerms}
        onClick={() => void handleClick()}
        className={className || 'btn-primary w-full'}
      >
        {buttonLabel}
      </button>
      <p className={`text-center text-xs ${mutedClassName}`}>
        {plan?.taxLabel || 'Excluido de IVA (0 % - Art. 476 ET)'}
      </p>
      {error ? <p className="text-center text-xs text-red-600">{error}</p> : null}

      {authGateOpen ? (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/50 p-4"
          role="presentation"
          onClick={() => setAuthGateOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={`bold-auth-title-${planId}`}
            aria-describedby={`bold-auth-desc-${planId}`}
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <h3
              id={`bold-auth-title-${planId}`}
              className="text-xl font-bold tracking-tight text-slate-900"
            >
              Antes de continuar al pago, crea tu cuenta gratis
            </h3>
            <p
              id={`bold-auth-desc-${planId}`}
              className="mt-3 text-sm leading-relaxed text-slate-600"
            >
              Para activar tu suscripción al instante necesitamos asociarla a tu cuenta. ¡Es muy fácil
              y te tomará menos de 1 minuto!
            </p>
            <div className="mt-6 flex flex-col gap-2.5">
              <button
                type="button"
                className="inline-flex w-full items-center justify-center rounded-lg bg-dental-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-dental-700"
                onClick={() => goToAuth('register')}
              >
                Crear mi cuenta (Registrarme)
              </button>
              <button
                type="button"
                className="inline-flex w-full items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50"
                onClick={() => goToAuth('login')}
              >
                Ya tengo cuenta, iniciar sesión
              </button>
              <button
                type="button"
                className="mt-1 text-sm font-medium text-slate-500 hover:text-slate-700"
                onClick={() => setAuthGateOpen(false)}
              >
                Volver
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
