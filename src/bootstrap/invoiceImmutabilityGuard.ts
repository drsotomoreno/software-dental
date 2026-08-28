import { CREDIT_NOTE_IMMUTABILITY_MESSAGE } from '@/types/creditNote'

const INVOICE_DELETE_PATTERN = /\/api\/invoices(\/|$)/i

/** Bloquea DELETE hacia facturas desde el cliente (capa defensiva DIAN). */
export function installInvoiceImmutabilityFetchGuard(): void {
  if (typeof window === 'undefined' || (window as unknown as { __invoiceGuard?: boolean }).__invoiceGuard) {
    return
  }

  const nativeFetch = window.fetch.bind(window)
  ;(window as unknown as { __invoiceGuard: boolean }).__invoiceGuard = true

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()

    if (method === 'DELETE' && INVOICE_DELETE_PATTERN.test(url)) {
      return new Response(
        JSON.stringify({ success: false, error: CREDIT_NOTE_IMMUTABILITY_MESSAGE }),
        { status: 403, headers: { 'Content-Type': 'application/json' } },
      )
    }

    return nativeFetch(input, init)
  }
}
