import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildActivationMessage,
  buildWhatsAppActivationLink,
  generateActivationToken,
  normalizeBusinessWhatsAppNumber,
} from './whatsappClickToChat.service.js'

test('genera un token de 6 caracteres alfanuméricos', () => {
  const token = generateActivationToken(6)
  assert.match(token, /^[A-Z0-9]{6}$/)
})

test('arma el enlace wa.me con el mensaje de activación', () => {
  const link = buildWhatsAppActivationLink('A4F8K2', '3001234567')
  assert.equal(link.ok, true)
  assert.equal(link.phone, '573001234567')
  assert.equal(link.message, 'Activar mi cuenta para el usuario A4F8K2')
  assert.equal(
    link.url,
    `https://wa.me/573001234567?text=${encodeURIComponent(buildActivationMessage('A4F8K2'))}`,
  )
})

test('rechaza un número corporativo vacío', () => {
  const link = buildWhatsAppActivationLink('A4F8K2', '')
  assert.equal(link.ok, false)
})

test('normaliza el celular corporativo de Colombia', () => {
  assert.equal(normalizeBusinessWhatsAppNumber('+57 300 123 4567'), '573001234567')
  assert.equal(normalizeBusinessWhatsAppNumber('3001234567'), '573001234567')
})
