import assert from 'node:assert/strict'
import test from 'node:test'
import {
  collectInboundMessages,
  digitsFromWhatsAppJid,
  extractWhatsAppCodes,
  senderDigitCandidates,
} from './evolutionInbound.service.js'

test('ignora LID y toma el teléfono de remoteJidAlt o senderPn', () => {
  assert.equal(digitsFromWhatsAppJid('123456789012345@lid'), '')
  assert.equal(digitsFromWhatsAppJid('573001234567@s.whatsapp.net'), '573001234567')
  const digits = senderDigitCandidates({
    remoteJid: '123456789012345@lid',
    remoteJidAlt: '573001234567@s.whatsapp.net',
    senderPn: '573001234567@s.whatsapp.net',
    fromMe: false,
  })
  assert.deepEqual(digits, ['573001234567'])
})

test('lee MESSAGES_UPSERT entrante y el código del texto', () => {
  const messages = collectInboundMessages({
    event: 'MESSAGES_UPSERT',
    data: {
      key: {
        remoteJid: '573001234567@s.whatsapp.net',
        fromMe: false,
      },
      message: {
        extendedTextMessage: { text: 'Verificar mi cuenta MiHistoriaDental: A4F8K2' },
      },
    },
  })
  assert.equal(messages.length, 1)
  assert.deepEqual(extractWhatsAppCodes(messages[0].message.extendedTextMessage.text), ['A4F8K2'])
})

test('descarta lo que envía la propia línea y otros eventos', () => {
  assert.equal(
    collectInboundMessages({
      event: 'messages.upsert',
      data: { key: { fromMe: true, remoteJid: '573001234567@s.whatsapp.net' }, message: { conversation: 'A4F8K2' } },
    }).length,
    0,
  )
  assert.equal(collectInboundMessages({ event: 'connection.update', data: {} }).length, 0)
  assert.equal(digitsFromWhatsAppJid('573001234567@g.us'), '')
})
