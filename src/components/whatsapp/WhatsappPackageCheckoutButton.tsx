import { useCallback, useState } from 'react'
import { Lock } from 'lucide-react'
import { createWhatsappCheckout } from '@/services/whatsappApiService'
import { getStoredApiAuth } from '@/services/apiAuthService'

const BOLD_SCRIPT_SRC = 'https://checkout.bold.co/library/boldPaymentButton.js'

type BoldCheckoutCtor = new (config: Record<string, string>) => { open: () => void }

declare global {
  interface Window {
    BoldCheckout?: BoldCheckoutCtor
  }
}

let boldScriptPromise: Promise<void> | null = null

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

type Props = {
  packageId: string
  locked?: boolean
  className?: string
  label?: string
}

export function WhatsappPackageCheckoutButton({
  packageId,
  locked = false,
  className = '',
  label = 'Comprar',
}: Props) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const handleClick = useCallback(async () => {
    setError('')
    if (locked) {
      setError('Requiere suscripción paga activa.')
      return
    }
    if (!getStoredApiAuth()?.token) {
      setError('Inicie sesión para comprar paquetes.')
      return
    }
    setBusy(true)
    try {
      await loadBoldScript()
      if (!window.BoldCheckout) {
        throw new Error('La librería BoldCheckout no está disponible.')
      }
      const integrity = await createWhatsappCheckout(packageId)
      const amount = String(integrity.amount ?? '')
        .trim()
        .replace(/\D/g, '')
      if (!amount) throw new Error('Monto Bold inválido.')

      const checkout = new window.BoldCheckout({
        orderId: String(integrity.orderId),
        currency: 'COP',
        amount,
        apiKey: String(integrity.apiKey),
        integritySignature: String(integrity.integritySignature),
        description: String(integrity.description || ''),
        redirectionUrl: `${window.location.origin}/whatsapp-chatbot?section=packages&pago=procesando`,
      })
      checkout.open()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo abrir el pago Bold.')
    } finally {
      setBusy(false)
    }
  }, [locked, packageId])

  if (locked) {
    return (
      <button
        type="button"
        disabled
        className={`inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-500 ${className}`}
        title="Exclusivo para planes pagos activos"
      >
        <Lock className="h-4 w-4" aria-hidden />
        {label}
      </button>
    )
  }

  return (
    <div className="space-y-1">
      <button
        type="button"
        disabled={busy}
        onClick={() => void handleClick()}
        className={
          className ||
          'inline-flex w-full items-center justify-center rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-500 disabled:opacity-60'
        }
      >
        {busy ? 'Abriendo Bold…' : label}
      </button>
      {error ? <p className="text-center text-xs text-red-600">{error}</p> : null}
    </div>
  )
}
