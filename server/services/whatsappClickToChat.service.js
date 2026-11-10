/**
 * Verificación Click-to-Chat (wa.me) — sin Cloud API de Meta.
 * El usuario envía un mensaje con token único al WhatsApp corporativo.
 */
import { randomInt } from 'node:crypto'
import { config } from '../config.js'

const TOKEN_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function generateActivationToken(length = 6) {
  let out = ''
  for (let i = 0; i < length; i += 1) {
    out += TOKEN_ALPHABET[randomInt(0, TOKEN_ALPHABET.length)]
  }
  return out
}

/** Solo dígitos internacionales (Colombia +57). */
export function normalizeBusinessWhatsAppNumber(raw) {
  const digits = String(raw ?? '').replace(/\D/g, '')
  if (!digits) return ''
  if (digits.startsWith('57') && digits.length >= 12) return digits
  if (digits.length === 10 && digits.startsWith('3')) return `57${digits}`
  return digits
}

export function getCorporateWhatsAppNumber() {
  return normalizeBusinessWhatsAppNumber(
    config.whatsappClickToChat?.businessNumber || process.env.WHATSAPP_BUSINESS_NUMBER,
  )
}

/**
 * Mensaje listo para enviar: "Activar mi cuenta para el usuario A4F8K2"
 */
export function buildActivationMessage(token) {
  const code = String(token || '')
    .trim()
    .toUpperCase()
  return `Activar mi cuenta para el usuario ${code}`
}

/**
 * https://wa.me/57XXXXXXXXXX?text=Activar+mi+cuenta+para+el+usuario+[TOKEN]
 */
export function buildWhatsAppActivationLink(token, businessNumber = getCorporateWhatsAppNumber()) {
  const phone = normalizeBusinessWhatsAppNumber(businessNumber)
  const code = String(token || '')
    .trim()
    .toUpperCase()
  if (!phone || phone.length < 12) {
    return {
      ok: false,
      error:
        'Falta el WhatsApp corporativo (WHATSAPP_BUSINESS_NUMBER) en el servidor.',
    }
  }
  if (!/^[A-Z0-9]{6}$/.test(code)) {
    return { ok: false, error: 'Token de activación inválido.' }
  }
  const text = buildActivationMessage(code)
  const url = `https://wa.me/${phone}?text=${encodeURIComponent(text)}`
  return { ok: true, url, phone, token: code, message: text }
}
