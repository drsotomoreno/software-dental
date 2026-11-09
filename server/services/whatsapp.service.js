/**
 * Evolution API — envío asíncrono de plantilla de bienvenida (registro express).
 * Contrato tipado en src/services/whatsapp.service.ts
 */
import { config } from '../config.js'
import { withPgClient } from './durableStore.js'
import {
  updateUserWhatsAppFields,
} from './subscriptionAuthStore.js'

export function toEvolutionWhatsAppNumber(phone) {
  const digits = String(phone ?? '').replace(/\D/g, '')
  if (!digits) return ''
  if (digits.startsWith('57') && digits.length >= 12) return digits
  if (digits.length === 10) return `57${digits}`
  return digits
}

export function isEvolutionConfigured() {
  const wa = config.evolutionWhatsapp || {}
  return Boolean(wa.baseUrl && wa.apiKey && wa.instance && wa.templateName)
}

/**
 * POST /message/sendTemplate/{instance}
 */
export async function sendWelcomeWhatsAppTemplate({ phoneNumber, nombre, email }) {
  if (!isEvolutionConfigured()) {
    return {
      ok: false,
      status: 'skipped',
      error: 'Evolution API no configurada (EVOLUTION_API_URL / API_KEY / INSTANCE).',
    }
  }

  const number = toEvolutionWhatsAppNumber(phoneNumber)
  if (!number || number.length < 12) {
    return {
      ok: false,
      status: 'failed',
      error: 'Número de WhatsApp inválido para Colombia (+57).',
    }
  }

  const wa = config.evolutionWhatsapp
  const base = String(wa.baseUrl).replace(/\/$/, '')
  const url = `${base}/message/sendTemplate/${encodeURIComponent(wa.instance)}`
  const body = {
    number,
    name: wa.templateName,
    language: wa.templateLanguage || 'es',
    components: [
      {
        type: 'body',
        parameters: [
          {
            type: 'text',
            text: String(nombre || 'Doctor(a)').trim() || 'Doctor(a)',
          },
        ],
      },
    ],
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: wa.apiKey,
      },
      body: JSON.stringify(body),
    })
    const raw = await response.json().catch(() => ({}))
    if (!response.ok) {
      const message =
        (raw && typeof raw === 'object' && raw.message && String(raw.message)) ||
        `Evolution HTTP ${response.status}`
      return { ok: false, status: 'failed', raw, error: message }
    }
    return { ok: true, status: 'sent', raw, email: email || undefined }
  } catch (error) {
    return {
      ok: false,
      status: 'failed',
      error: error instanceof Error ? error.message : 'Error de red con Evolution API',
      email: email || undefined,
    }
  }
}

async function persistWhatsAppStatusPostgres({ userId, email, phoneNumber, whatsappStatus, whatsappVerified }) {
  try {
    await withPgClient(async (client) => {
      await client.query(
        `UPDATE usuarios
         SET phone_number = COALESCE(NULLIF($1::text, ''), phone_number),
             whatsapp_status = $2::text,
             whatsapp_verified = $3::boolean
         WHERE ($4::text IS NOT NULL AND id::text = $4::text)
            OR ($5::text IS NOT NULL AND lower(email) = lower($5::text))`,
        [
          phoneNumber || null,
          whatsappStatus,
          Boolean(whatsappVerified),
          userId || null,
          email || null,
        ],
      )
    })
  } catch (error) {
    if (error?.code !== 'PG_UNAVAILABLE') {
      console.error(
        '[WhatsApp] No se pudo actualizar usuarios en Postgres:',
        error instanceof Error ? error.message : error,
      )
    }
  }
}

/**
 * Envío en segundo plano tras res.status(201). No lanza hacia el request HTTP.
 */
export function voidSendWelcomeWhatsAppInBackground({
  userId,
  email,
  phoneNumber,
  nombre,
}) {
  setImmediate(() => {
    void (async () => {
      const normalizedPhone = toEvolutionWhatsAppNumber(phoneNumber)
      if (!normalizedPhone) {
        await updateUserWhatsAppFields({
          userId,
          email,
          phone_number: '',
          whatsapp_verified: false,
          whatsapp_status: 'skipped',
        })
        await persistWhatsAppStatusPostgres({
          userId,
          email,
          phoneNumber: '',
          whatsappStatus: 'skipped',
          whatsappVerified: false,
        })
        return
      }

      await updateUserWhatsAppFields({
        userId,
        email,
        phone_number: normalizedPhone,
        whatsapp_verified: false,
        whatsapp_status: 'queued',
      })
      await persistWhatsAppStatusPostgres({
        userId,
        email,
        phoneNumber: normalizedPhone,
        whatsappStatus: 'queued',
        whatsappVerified: false,
      })

      const result = await sendWelcomeWhatsAppTemplate({
        phoneNumber: normalizedPhone,
        nombre,
        email,
      })

      const nextStatus = result.status || (result.ok ? 'sent' : 'failed')
      const verified = nextStatus === 'verified'

      await updateUserWhatsAppFields({
        userId,
        email,
        phone_number: normalizedPhone,
        whatsapp_verified: verified,
        whatsapp_status: nextStatus,
      })
      await persistWhatsAppStatusPostgres({
        userId,
        email,
        phoneNumber: normalizedPhone,
        whatsappStatus: nextStatus,
        whatsappVerified: verified,
      })

      if (!result.ok) {
        console.error(
          '[WhatsApp] Plantilla de bienvenida no enviada',
          JSON.stringify({
            email,
            userId,
            status: nextStatus,
            error: result.error,
          }),
        )
      } else {
        console.log(`[WhatsApp] Bienvenida enviada a ${normalizedPhone} (${email || userId})`)
      }
    })().catch((error) => {
      console.error(
        '[WhatsApp] Fallo en setImmediate de bienvenida:',
        error instanceof Error ? error.message : error,
      )
    })
  })
}
