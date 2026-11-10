/**
 * OTP de registro por la Cloud API oficial de Meta (plantilla authentication).
 * El código no se escribe en logs ni se devuelve al cliente.
 */
import { randomInt } from 'node:crypto'
import { config } from '../config.js'

export const WHATSAPP_OTP_TTL_MS = 10 * 60 * 1000
const SEND_COOLDOWN_MS = 60 * 1000
const SEND_WINDOW_MS = 60 * 60 * 1000
const MAX_SENDS_PER_WINDOW = 5

const sendLog = new Map()

export function resetWhatsAppSendRateLimitForTests() {
  sendLog.clear()
}

export function generateSixDigitOtp() {
  return String(randomInt(0, 1_000_000)).padStart(6, '0')
}

/** Celular Colombia: 10 dígitos que empiezan en 3, o 57 seguido de esos 10. */
export function normalizeWhatsAppRecipient(raw) {
  const digits = String(raw ?? '').replace(/\D/g, '')
  if (digits.length === 10 && digits.startsWith('3')) return `57${digits}`
  if (digits.length === 12 && digits.startsWith('57') && digits[2] === '3') return digits
  return ''
}

export function isMetaWhatsAppConfigured(cfg = config.metaWhatsapp) {
  return Boolean(cfg?.accessToken && cfg?.phoneNumberId && cfg?.templateName)
}

export function assertWhatsAppSendAllowed(phone, now = Date.now()) {
  const key = normalizeWhatsAppRecipient(phone)
  if (!key) {
    return {
      ok: false,
      status: 400,
      error: 'Indique un celular colombiano válido (+57), por ejemplo 3001234567.',
    }
  }
  const stamps = (sendLog.get(key) || []).filter((stamp) => now - stamp < SEND_WINDOW_MS)
  sendLog.set(key, stamps)
  const last = stamps[stamps.length - 1]
  if (last && now - last < SEND_COOLDOWN_MS) {
    return {
      ok: false,
      status: 429,
      error: 'Espere un minuto antes de solicitar otro código por WhatsApp.',
    }
  }
  if (stamps.length >= MAX_SENDS_PER_WINDOW) {
    return {
      ok: false,
      status: 429,
      error: 'Demasiados códigos para este número. Intente de nuevo más tarde.',
    }
  }
  return { ok: true, phone: key }
}

export function commitWhatsAppSend(phone, now = Date.now()) {
  const key = normalizeWhatsAppRecipient(phone)
  if (!key) return
  const stamps = (sendLog.get(key) || []).filter((stamp) => now - stamp < SEND_WINDOW_MS)
  stamps.push(now)
  sendLog.set(key, stamps)
}

/**
 * Traduce el error de Graph API a un mensaje usable por el registro.
 * No reenvía el cuerpo crudo de Meta al navegador.
 */
export function mapMetaSendError(httpStatus, body) {
  const err = body && typeof body === 'object' ? body.error || {} : {}
  const code = Number(err.code)
  const message = String(err.message || '')
  const invalidNumber =
    code === 131026 ||
    code === 133010 ||
    code === 131009 ||
    code === 33 ||
    (code === 100 && /phone|recipient|parameter|n[uú]mero/i.test(message))

  if (code === 190 || code === 102 || code === 10 || httpStatus === 401 || httpStatus === 403) {
    return {
      ok: false,
      status: 503,
      kind: 'meta_auth',
      error: 'La verificación por WhatsApp no está disponible en este momento.',
    }
  }
  if (code === 4 || code === 80007 || code === 130429 || code === 131056 || httpStatus === 429) {
    return {
      ok: false,
      status: 429,
      kind: 'meta_rate',
      error: 'WhatsApp limitó el envío. Espere un momento e intente de nuevo.',
    }
  }
  if (invalidNumber) {
    return {
      ok: false,
      status: 400,
      kind: 'invalid_number',
      error: 'No se pudo entregar el código. Revise que el número tenga WhatsApp activo.',
    }
  }
  return {
    ok: false,
    status: 502,
    kind: 'meta_error',
    error: 'No se pudo enviar el código por WhatsApp. Intente de nuevo.',
  }
}

function authTemplatePayload(to, code, cfg) {
  const components = [
    {
      type: 'body',
      parameters: [{ type: 'text', text: code }],
    },
  ]
  if (cfg.includeButton !== false) {
    components.push({
      type: 'button',
      sub_type: 'url',
      index: '0',
      parameters: [{ type: 'text', text: code }],
    })
  }
  return {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'template',
    template: {
      name: cfg.templateName,
      language: { code: cfg.templateLanguage || 'es' },
      components,
    },
  }
}

/**
 * POST https://graph.facebook.com/{version}/{phone-number-id}/messages
 * Plantilla authentication: el mismo OTP va en el cuerpo y en el botón de copiar código.
 */
export async function sendAuthenticationOtp({ to, code }, deps = {}) {
  const cfg = deps.config || config.metaWhatsapp || {}
  const fetchImpl = deps.fetch || globalThis.fetch
  const recipient = normalizeWhatsAppRecipient(to)
  const otp = String(code ?? '').replace(/\D/g, '')

  if (!recipient) {
    return {
      ok: false,
      status: 400,
      kind: 'invalid_number',
      error: 'Indique un celular colombiano válido (+57), por ejemplo 3001234567.',
    }
  }
  if (!/^\d{6}$/.test(otp)) {
    return {
      ok: false,
      status: 500,
      kind: 'otp',
      error: 'No se pudo generar el código de verificación.',
    }
  }
  if (!isMetaWhatsAppConfigured(cfg)) {
    return {
      ok: false,
      status: 503,
      kind: 'not_configured',
      error: 'La verificación por WhatsApp no está configurada en el servidor.',
    }
  }

  const version = String(cfg.graphVersion || 'v22.0').replace(/^\/+|\/+$/g, '')
  const url = `https://graph.facebook.com/${version}/${encodeURIComponent(cfg.phoneNumberId)}/messages`
  const payload = authTemplatePayload(recipient, otp, cfg)

  try {
    const response = await fetchImpl(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: deps.signal || AbortSignal.timeout(15_000),
    })
    const raw = await response.json().catch(() => ({}))
    if (!response.ok) {
      const mapped = mapMetaSendError(response.status, raw)
      const meta = raw && typeof raw === 'object' ? raw.error || {} : {}
      console.error(
        '[WhatsApp OTP] Meta rechazó el envío',
        JSON.stringify({
          httpStatus: response.status,
          code: meta.code,
          subcode: meta.error_subcode,
          fbtrace_id: meta.fbtrace_id,
          to: `${recipient.slice(0, 4)}…${recipient.slice(-2)}`,
        }),
      )
      return mapped
    }
    const messageId =
      raw && Array.isArray(raw.messages) && raw.messages[0] && raw.messages[0].id
        ? String(raw.messages[0].id)
        : null
    return { ok: true, status: 200, messageId, to: recipient }
  } catch (error) {
    console.error(
      '[WhatsApp OTP] Error de red con Graph API:',
      error instanceof Error ? error.message : error,
    )
    return {
      ok: false,
      status: 502,
      kind: 'network',
      error: 'No se pudo contactar a WhatsApp. Intente de nuevo.',
    }
  }
}
