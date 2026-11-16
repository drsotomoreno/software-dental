/**
 * Lectura de mensajes entrantes de Evolution API / Baileys.
 * No envía nada: solo extrae remitente y texto.
 */

const WHATSAPP_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function normalizeEventName(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '.')
    .replace(/_/g, '.')
}

export function isMessagesUpsertEvent(body) {
  const name = normalizeEventName(body?.event || body?.type || body?.eventType)
  if (!name) return true
  return name === 'messages.upsert' || name === 'message.upsert'
}

/** Dígitos de un JID de teléfono. Ignora grupos, estados y LID (no son el celular). */
export function digitsFromWhatsAppJid(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  const at = raw.indexOf('@')
  const user = at === -1 ? raw : raw.slice(0, at)
  const host = at === -1 ? '' : raw.slice(at + 1).toLowerCase()
  if (!user) return ''
  if (host.endsWith('g.us') || host.includes('broadcast') || host === 'status') return ''
  if (host === 'lid' || host.endsWith('.lid')) return ''
  if (
    host &&
    host !== 's.whatsapp.net' &&
    host !== 'c.us' &&
    host !== 'whatsapp.net' &&
    !host.endsWith('.whatsapp.net')
  ) {
    return ''
  }
  const digits = user.replace(/\D/g, '')
  if (digits.length < 8 || digits.length > 15) return ''
  return digits
}

export function senderDigitCandidates(key, item) {
  const source = key && typeof key === 'object' ? key : {}
  const extra = item && typeof item === 'object' ? item : {}
  const values = [
    source.remoteJid,
    source.remoteJidAlt,
    source.senderPn,
    extra.senderPn,
    extra.sender,
    extra.participant,
  ]
  const found = []
  for (const value of values) {
    const digits = digitsFromWhatsAppJid(value)
    if (digits && !found.includes(digits)) found.push(digits)
  }
  return found
}

export function inboundMessageText(message) {
  if (!message || typeof message !== 'object') return ''
  if (typeof message.conversation === 'string' && message.conversation.trim()) {
    return message.conversation
  }
  const extended = message.extendedTextMessage
  if (extended && typeof extended.text === 'string' && extended.text.trim()) return extended.text
  const wrapped = message.ephemeralMessage?.message || message.viewOnceMessage?.message
  if (wrapped && wrapped !== message) return inboundMessageText(wrapped)
  return ''
}

export function extractWhatsAppCodes(text) {
  const upper = String(text || '').toUpperCase()
  const token = `[${WHATSAPP_CODE_ALPHABET}]{6}`
  const labeled = [
    ...upper.matchAll(new RegExp(`MIHISTORIADENTAL:\\s*(${token})(?![${WHATSAPP_CODE_ALPHABET}])`, 'g')),
  ].map((match) => match[1])
  if (labeled.length) return [...new Set(labeled)]

  const trimmed = upper.trim()
  if (new RegExp(`^${token}$`).test(trimmed)) return [trimmed]

  return [
    ...new Set(
      [...upper.matchAll(new RegExp(`(?:^|[^${WHATSAPP_CODE_ALPHABET}])(${token})(?![${WHATSAPP_CODE_ALPHABET}])`, 'g'))].map(
        (match) => match[1],
      ),
    ),
  ]
}

function pushMessage(list, item) {
  if (!item || typeof item !== 'object') return
  if (item.key?.fromMe === true || item.fromMe === true) return
  list.push(item)
}

/** Mensajes entrantes (fromMe !== true) de un webhook MESSAGES_UPSERT. */
export function collectInboundMessages(body) {
  if (!body || typeof body !== 'object') return []
  if (!isMessagesUpsertEvent(body)) return []
  const data = body.data === undefined ? body : body.data
  const list = []
  if (Array.isArray(data)) {
    for (const item of data) pushMessage(list, item)
    return list
  }
  if (!data || typeof data !== 'object') return list
  if (Array.isArray(data.messages)) {
    for (const item of data.messages) pushMessage(list, item)
    return list
  }
  if (data.key || data.message) pushMessage(list, data)
  return list
}
