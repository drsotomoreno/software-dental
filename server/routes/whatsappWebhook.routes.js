/**
 * Webhook Meta Cloud API — verificación + mensajes entrantes (confirmación / chatbot).
 * Montaje: app.use('/api/webhooks/whatsapp', whatsappWebhookRoutes)
 */
import { Router } from 'express'
import {
  findClinicByWhatsappPhoneNumberId,
} from '../services/whatsappClinicStore.js'
import {
  BTN_CONFIRMAR_CITA,
  BTN_NO_CONTACTAR,
  confirmNextAppointment,
  handleChatbotInbound,
  optOutNoShowFollowups,
} from '../services/whatsappChatbot.service.js'
import { sendTextMessage, normalizeMetaRecipient } from '../services/metaWhatsappClient.js'

const router = Router()
const LOG = '[WhatsAppWebhook]'

function verifyToken() {
  return String(process.env.META_WEBHOOK_VERIFY_TOKEN || '').trim()
}

/**
 * GET — hub.mode=subscribe + hub.verify_token
 */
router.get('/', (req, res) => {
  const mode = String(req.query['hub.mode'] || req.query.hub_mode || '').trim()
  const token = String(req.query['hub.verify_token'] || req.query.hub_verify_token || '').trim()
  const challenge = req.query['hub.challenge'] ?? req.query.hub_challenge ?? ''
  const expected = verifyToken()

  if (mode === 'subscribe' && expected && token === expected) {
    console.log(LOG, 'Verificación OK')
    return res.status(200).send(String(challenge))
  }

  console.warn(LOG, 'Verificación rechazada', { mode, hasToken: Boolean(token) })
  return res.status(403).send('Forbidden')
})

function extractInboundMessages(body) {
  const out = []
  const entries = Array.isArray(body?.entry) ? body.entry : []
  for (const entry of entries) {
    const changes = Array.isArray(entry?.changes) ? entry.changes : []
    for (const change of changes) {
      const value = change?.value && typeof change.value === 'object' ? change.value : {}
      const phoneNumberId = String(value?.metadata?.phone_number_id || '').trim()
      const messages = Array.isArray(value.messages) ? value.messages : []
      for (const message of messages) {
        out.push({ phoneNumberId, message, contacts: value.contacts })
      }
    }
  }
  return out
}

function buttonIdFromMessage(message) {
  if (!message || typeof message !== 'object') return ''
  if (message.type === 'button' && message.button?.payload) {
    return String(message.button.payload).trim()
  }
  if (message.type === 'interactive') {
    const reply = message.interactive?.button_reply || message.interactive?.list_reply
    if (reply?.id) return String(reply.id).trim()
  }
  return ''
}

function textFromMessage(message) {
  if (!message || typeof message !== 'object') return ''
  if (message.type === 'text') return String(message.text?.body || '').trim()
  if (message.type === 'button') return String(message.button?.text || '').trim()
  if (message.type === 'interactive') {
    const reply = message.interactive?.button_reply || message.interactive?.list_reply
    return String(reply?.title || '').trim()
  }
  return ''
}

/**
 * POST — eventos entrantes Meta
 */
router.post('/', async (req, res) => {
  // Responder 200 rápido a Meta; procesar best-effort.
  res.status(200).json({ success: true, ok: true })

  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {}
    const inbound = extractInboundMessages(body)
    for (const item of inbound) {
      const phoneNumberId = item.phoneNumberId
      const message = item.message
      const from = normalizeMetaRecipient(message?.from)
      if (!phoneNumberId || !from) continue

      const clinic = await findClinicByWhatsappPhoneNumberId(phoneNumberId)
      if (!clinic) {
        console.warn(LOG, 'Clínica no encontrada para phone_number_id', phoneNumberId)
        continue
      }

      const buttonId = buttonIdFromMessage(message).toUpperCase()
      const textBody = textFromMessage(message)

      if (buttonId === BTN_CONFIRMAR_CITA || /confirmar\s*cita/i.test(textBody)) {
        const appt = await confirmNextAppointment(clinic.id, from)
        const when = appt?.start_time
          ? new Date(appt.start_time).toLocaleString('es-CO', {
              timeZone: 'America/Bogota',
              dateStyle: 'medium',
              timeStyle: 'short',
            })
          : null
        await sendTextMessage({
          clinicId: clinic.id,
          toPhone: from,
          body: when
            ? `✅ Cita confirmada para ${when}. ¡Le esperamos!`
            : '✅ Gracias. Su confirmación quedó registrada.',
        })
        continue
      }

      if (buttonId === BTN_NO_CONTACTAR || /no\s*contactar|no\s*llamar|opt[\s-]?out/i.test(textBody)) {
        await optOutNoShowFollowups(clinic.id, from)
        await sendTextMessage({
          clinicId: clinic.id,
          toPhone: from,
          body: 'Entendido. No le contactaremos más por inasistencias. Si cambia de opinión, escríbanos.',
        })
        continue
      }

      // Chatbot híbrido (mensajes de atención / menú).
      const result = await handleChatbotInbound({
        clinicRow: clinic,
        patientPhone: from,
        buttonId,
        textBody,
      })
      if (!result.ok) {
        console.info(LOG, 'Chatbot sin respuesta automática', {
          clinicId: clinic.id,
          code: result.code,
        })
      }
    }
  } catch (error) {
    console.error(LOG, 'Error procesando webhook:', error instanceof Error ? error.message : error)
  }
})

export default router
