import { useCallback, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getStoredApiAuth } from '@/services/apiAuthService'
import { getPaidPlanById, isBoldCheckoutPlan } from '@/services/subscriptionService'

const BOLD_SCRIPT_SRC = 'https://checkout.bold.co/library/boldPaymentButton.js'

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
}

/**
 * Botón de Pagos Bold: suscripción anual, cuota mensual con autorización del suscriptor, IVA excluido.
 * No envía `tax` al SDK (Bold trata el cobro sin IVA / 0 % al omitirlo).
 */
export function BoldCheckoutButton({
  planId,
  planName,
  disabled = false,
  className = '',
  label,
  mutedClassName = 'text-slate-500',
  paidInstallmentNumber = null,
}: BoldCheckoutButtonProps) {
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [acceptedTerms, setAcceptedTerms] = useState(false)

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
      const q = new URLSearchParams({ plan: planId })
      navigate(`/login?${q.toString()}`, {
        state: { from: `/suscripcion?plan=${encodeURIComponent(planId)}` },
      })
      return
    }

    setBusy(true)
    try {
      await loadBoldScript()
      if (!window.BoldCheckout) {
        throw new Error('La librería BoldCheckout no está disponible.')
      }

      const integrity = await requestIntegrity(planId)
      // Exactamente el mismo string firmado en el backend (sin recalcular).
      const amount = String(integrity.amount ?? '')
        .trim()
        .replace(/\D/g, '')
      if (!amount) {
        throw new Error('Monto Bold inválido.')
      }
      const currency = 'COP'
      const redirectionUrl = `${window.location.origin}/suscripcion?pago=procesando`

      const boldConfig = {
        orderId: String(integrity.orderId),
        currency,
        amount,
        apiKey: String(integrity.apiKey),
        integritySignature: String(integrity.integritySignature),
        description: String(integrity.description || ''),
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
      checkout.open()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo abrir el pago Bold.')
    } finally {
      setBusy(false)
    }
  }, [acceptedTerms, navigate, planId])

  const defaultLabel = inAnnualCommitment
    ? `Pagar Cuota ${nextInstallment}/12 con Bold (${amountLabel} COP)`
    : planName
      ? `Pagar ${planName}`
      : 'Pagar con Bold'
  const buttonLabel = label || (busy ? 'Abriendo Bold…' : defaultLabel)

  const consentId = `bold-consent-${planId}`

  return (
    <div className="space-y-3">
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
    </div>
  )
}
