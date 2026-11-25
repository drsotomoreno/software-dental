import assert from 'node:assert/strict'
import test from 'node:test'
import {
  BTN_AGENDAR,
  BTN_CONFIRMAR_CITA,
  BTN_HORARIOS,
  BTN_NO_CONTACTAR,
  BTN_PRECIOS,
  mainMenuInteractive,
} from './whatsappChatbot.service.js'
import { canOpenChatbotSession, shouldDebitChatbotSession } from './whatsappRemindersLogic.js'

test('menú híbrido expone Agendar / Horarios / Precios', () => {
  const menu = mainMenuInteractive('Clínica Demo')
  assert.equal(menu.type, 'button')
  const ids = menu.action.buttons.map((b) => b.reply.id)
  assert.deepEqual(ids, [BTN_AGENDAR, BTN_HORARIOS, BTN_PRECIOS])
  assert.ok(menu.body.text.includes('Clínica Demo'))
})

test('payloads de confirmación y opt-out están estables', () => {
  assert.equal(BTN_CONFIRMAR_CITA, 'CONFIRMAR_CITA')
  assert.equal(BTN_NO_CONTACTAR, 'NO_CONTACTAR')
})

test('ventana chatbot: no descuenta si window_expires_at > now', () => {
  const now = new Date('2026-11-24T10:00:00.000Z')
  const session = { window_expires_at: '2026-11-24T20:00:00.000Z' }
  assert.equal(shouldDebitChatbotSession(session, now), false)

  const gate = canOpenChatbotSession({
    paidSubscription: true,
    chatbotEnabled: true,
    chatbotSessionsBalance: 1,
    existingSession: session,
    now,
  })
  assert.equal(gate.debit, false)
  assert.equal(gate.reuseWindow, true)
})

test('sin chatbot_enabled no abre sesión aunque haya saldo', () => {
  const gate = canOpenChatbotSession({
    paidSubscription: true,
    chatbotEnabled: false,
    chatbotSessionsBalance: 100,
    existingSession: null,
  })
  assert.equal(gate.ok, false)
  assert.equal(gate.code, 'CHATBOT_DISABLED')
})
