/**
 * Cliente Evolution API — plantilla de bienvenida WhatsApp (registro express).
 * Las credenciales viven en el servidor (`server/services/whatsapp.service.js`);
 * este módulo tipa el contrato y puede reutilizarse en tests o workers Node.
 */

export type WhatsAppDeliveryStatus =
  | 'pending'
  | 'queued'
  | 'sent'
  | 'failed'
  | 'verified'
  | 'skipped'

export type EvolutionWhatsAppConfig = {
  baseUrl: string
  apiKey: string
  instance: string
  templateName: string
  templateLanguage: string
}

export type WelcomeWhatsAppPayload = {
  phoneNumber: string
  nombre: string
  email?: string
}

export type WelcomeWhatsAppResult = {
  ok: boolean
  status: WhatsAppDeliveryStatus
  raw?: unknown
  error?: string
}

/** Solo dígitos; Colombia 10 → prefijo 57. */
export function toEvolutionWhatsAppNumber(phone: string): string {
  const digits = String(phone ?? '').replace(/\D/g, '')
  if (!digits) return ''
  if (digits.startsWith('57') && digits.length >= 12) return digits
  if (digits.length === 10) return `57${digits}`
  return digits
}

export function isEvolutionConfigured(config: Partial<EvolutionWhatsAppConfig> | null | undefined): boolean {
  return Boolean(
    config?.baseUrl &&
      config?.apiKey &&
      config?.instance &&
      config?.templateName,
  )
}

/**
 * Envía la plantilla de bienvenida vía Evolution API
 * POST /message/sendTemplate/{instance}
 */
export async function sendWelcomeWhatsAppTemplate(
  config: EvolutionWhatsAppConfig,
  payload: WelcomeWhatsAppPayload,
  fetchImpl: typeof fetch = fetch,
): Promise<WelcomeWhatsAppResult> {
  if (!isEvolutionConfigured(config)) {
    return {
      ok: false,
      status: 'skipped',
      error: 'Evolution API no configurada (EVOLUTION_API_URL / API_KEY / INSTANCE).',
    }
  }

  const number = toEvolutionWhatsAppNumber(payload.phoneNumber)
  if (!number || number.length < 12) {
    return {
      ok: false,
      status: 'failed',
      error: 'Número de WhatsApp inválido para Colombia (+57).',
    }
  }

  const base = config.baseUrl.replace(/\/$/, '')
  const url = `${base}/message/sendTemplate/${encodeURIComponent(config.instance)}`
  const body = {
    number,
    name: config.templateName,
    language: config.templateLanguage || 'es',
    components: [
      {
        type: 'body',
        parameters: [
          { type: 'text', text: String(payload.nombre || 'Doctor(a)').trim() || 'Doctor(a)' },
        ],
      },
    ],
  }

  try {
    const response = await fetchImpl(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: config.apiKey,
      },
      body: JSON.stringify(body),
    })

    const raw = await response.json().catch(() => ({}))
    if (!response.ok) {
      const message =
        (raw && typeof raw === 'object' && 'message' in raw && String((raw as { message?: unknown }).message)) ||
        `Evolution HTTP ${response.status}`
      return { ok: false, status: 'failed', raw, error: message }
    }

    return { ok: true, status: 'sent', raw }
  } catch (error) {
    return {
      ok: false,
      status: 'failed',
      error: error instanceof Error ? error.message : 'Error de red con Evolution API',
    }
  }
}
