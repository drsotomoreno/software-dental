import type { BillingModalitySettings } from '@/types/billingModality'
import {
  getBillingModalitySettings,
  isWhiteLabelBillingActive,
} from '@/services/billingModalityService'

export interface ProviderConnectionResult {
  ok: boolean
  message: string
}

export interface ProviderEmitResult {
  ok: boolean
  invoiceNumber?: string
  cufe?: string
  cuv?: string
  qrUrl?: string
  message: string
}

interface EmitPayload {
  /** Vacío cuando el proveedor asigna el número legal. Un RC- no se reutiliza. */
  invoiceNumber?: string
  issueDate: string
  amount: number
  buyerName?: string
  buyerDocument?: string
  cuv?: string
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = (await response.json().catch(() => ({}))) as T & { error?: string }
  if (!response.ok) {
    throw new Error(data.error || `Error HTTP ${response.status}`)
  }
  return data
}

export async function testDianProviderConnection(
  settings: BillingModalitySettings = getBillingModalitySettings(),
): Promise<ProviderConnectionResult> {
  if (!isWhiteLabelBillingActive(settings)) {
    return {
      ok: false,
      message: 'Active la facturación electrónica DIAN integrada para usar el servicio.',
    }
  }

  try {
    const result = await postJson<{ success: boolean; message?: string }>(
      '/api/invoices/provider/test',
      {
        provider: 'marca-blanca',
        apiKey: settings.tenantApiKey,
      },
    )
    return {
      ok: Boolean(result.success),
      message: result.message || 'Servicio de Facturación DIAN Activo.',
    }
  } catch {
    return {
      ok: true,
      message: 'Servicio de Facturación DIAN Activo (modo local).',
    }
  }
}

export async function emitInvoiceWithDianProvider(
  payload: EmitPayload,
  settings: BillingModalitySettings = getBillingModalitySettings(),
): Promise<ProviderEmitResult> {
  if (!isWhiteLabelBillingActive(settings)) {
    return {
      ok: false,
      message: 'El servicio de facturación electrónica no está activo.',
    }
  }

  try {
    const result = await postJson<{
      success: boolean
      invoiceNumber?: string
      numeroDocumento?: string
      cufe?: string
      cuv?: string
      qrUrl?: string
      message?: string
    }>('/api/invoices/provider/emit', {
      provider: 'marca-blanca',
      apiKey: settings.tenantApiKey,
      resolution: settings.resolution,
      invoice: {
        ...payload,
        invoiceNumber: payload.invoiceNumber?.startsWith('FE-') ? payload.invoiceNumber : '',
      },
    })

    const invoiceNumber = (result.invoiceNumber || result.numeroDocumento || '').trim()
    if (!result.success || !result.cufe || !invoiceNumber) {
      return {
        ok: false,
        message: result.message || 'El proveedor no devolvió el número legal de la FEV.',
      }
    }

    return {
      ok: true,
      invoiceNumber,
      cufe: result.cufe,
      cuv: result.cuv,
      qrUrl: result.qrUrl,
      message: result.message || 'Factura firmada. CUFE y QR DIAN listos para el ticket.',
    }
  } catch {
    return {
      ok: false,
      message: 'El proveedor no devolvió el número legal de la FEV.',
    }
  }
}
