import assert from 'node:assert/strict'
import test from 'node:test'
import {
  canOpenChatbotSession,
  canSpendReminderCredit,
  isEligibleFor24hReminder,
  isEligibleFor48hReminder,
  nextNoShowFollowupAfterSend,
  REMINDER_24H_DELAY_MS,
  shouldDebitChatbotSession,
} from './whatsappRemindersLogic.js'
import { hasActivePaidSubscription } from '../../shared/whatsappPackages.js'
import { resolveSendMode } from './metaWhatsappClient.js'
import { appointmentFieldsFromSync } from './whatsappAppointmentSync.js'

test('ventana 23h 45m: elegible solo tras el delay y sin confirmación', () => {
  const now = new Date('2026-11-24T18:00:00.000Z')
  const tooRecent = {
    reminder_48h_sent_at: new Date(now.getTime() - (23 * 60 + 30) * 60 * 1000).toISOString(),
    reminder_24h_sent_at: null,
    confirmed_by_patient: false,
    status: 'programada',
    start_time: new Date(now.getTime() + 20 * 60 * 60 * 1000).toISOString(),
  }
  assert.equal(isEligibleFor24hReminder(tooRecent, now), false)

  const due = {
    ...tooRecent,
    reminder_48h_sent_at: new Date(now.getTime() - REMINDER_24H_DELAY_MS).toISOString(),
  }
  assert.equal(isEligibleFor24hReminder(due, now), true)

  assert.equal(
    isEligibleFor24hReminder({ ...due, confirmed_by_patient: true }, now),
    false,
    'si ya confirmó, no gasta el segundo crédito',
  )
  assert.equal(
    isEligibleFor24hReminder({ ...due, reminder_24h_sent_at: now.toISOString() }, now),
    false,
  )
})

test('recordatorio 48h solo para citas futuras dentro del horizonte', () => {
  const now = new Date('2026-11-24T12:00:00.000Z')
  assert.equal(
    isEligibleFor48hReminder(
      {
        reminder_48h_sent_at: null,
        confirmed_by_patient: false,
        status: 'programada',
        start_time: new Date(now.getTime() + 30 * 60 * 60 * 1000).toISOString(),
      },
      now,
    ),
    true,
  )
  assert.equal(
    isEligibleFor48hReminder(
      {
        reminder_48h_sent_at: null,
        status: 'programada',
        start_time: new Date(now.getTime() + 50 * 60 * 60 * 1000).toISOString(),
      },
      now,
    ),
    false,
  )
})

test('step 2 tras envío pasa a pending_manual_call', () => {
  const now = new Date('2026-11-24T12:00:00.000Z')
  const afterStep1 = nextNoShowFollowupAfterSend(1, now)
  assert.equal(afterStep1.step, 2)
  assert.equal(afterStep1.status, 'active')
  assert.ok(afterStep1.next_send_at)

  const afterStep2 = nextNoShowFollowupAfterSend(2, now)
  assert.equal(afterStep2.step, 2)
  assert.equal(afterStep2.status, 'pending_manual_call')
  assert.equal(afterStep2.next_send_at, null)
})

test('descuento de sesiones chatbot: reutiliza ventana 24h sin debitar', () => {
  const now = new Date('2026-11-24T12:00:00.000Z')
  const openSession = {
    window_expires_at: new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
  }
  assert.equal(shouldDebitChatbotSession(openSession, now), false)

  const gateReuse = canOpenChatbotSession({
    paidSubscription: true,
    chatbotEnabled: true,
    chatbotSessionsBalance: 5,
    existingSession: openSession,
    now,
  })
  assert.equal(gateReuse.ok, true)
  assert.equal(gateReuse.debit, false)
  assert.equal(gateReuse.reuseWindow, true)

  const gateNew = canOpenChatbotSession({
    paidSubscription: true,
    chatbotEnabled: true,
    chatbotSessionsBalance: 5,
    existingSession: {
      window_expires_at: new Date(now.getTime() - 1000).toISOString(),
    },
    now,
  })
  assert.equal(gateNew.ok, true)
  assert.equal(gateNew.debit, true)

  const gateEmpty = canOpenChatbotSession({
    paidSubscription: true,
    chatbotEnabled: true,
    chatbotSessionsBalance: 0,
    existingSession: null,
    now,
  })
  assert.equal(gateEmpty.ok, false)
  assert.equal(gateEmpty.code, 'CHATBOT_SESSIONS_BALANCE_EMPTY')
})

test('bloqueo sin suscripción paga (cron y chatbot)', () => {
  assert.equal(
    hasActivePaidSubscription({
      estado_pago: 'prueba',
      plan: 'nomad',
      fecha_vencimiento: new Date(Date.now() + 86400000).toISOString(),
    }),
    false,
  )

  const spend = canSpendReminderCredit({
    paidSubscription: false,
    remindersBalance: 10,
  })
  assert.equal(spend.ok, false)
  assert.equal(spend.code, 'WHATSAPP_PAID_SUBSCRIPTION_REQUIRED')

  const chat = canOpenChatbotSession({
    paidSubscription: false,
    chatbotEnabled: true,
    chatbotSessionsBalance: 10,
    existingSession: null,
  })
  assert.equal(chat.ok, false)
  assert.equal(chat.code, 'WHATSAPP_PAID_SUBSCRIPTION_REQUIRED')
})

test('DRY_RUN cuando whatsapp_connected es false', () => {
  const mode = resolveSendMode({
    whatsapp_connected: false,
    whatsapp_phone_number_id: '123',
    whatsapp_access_token: 'v1:x:y:z',
  })
  assert.equal(mode.dryRun, true)
  assert.match(mode.reason, /whatsapp_connected/)
})

test('appointmentFieldsFromSync normaliza no_asistio y teléfono CO', () => {
  const fields = appointmentFieldsFromSync(
    {
      syncId: 'apt-1',
      payload: {
        patientPhone: '3001234567',
        patientName: 'Ana',
        startTime: '2026-11-25T15:00:00.000Z',
        status: 'no_asistio',
      },
    },
    'clinic:demo',
  )
  assert.equal(fields.patientPhone, '573001234567')
  assert.equal(fields.status, 'no_asistio')
  assert.equal(fields.syncId, 'apt-1')
})
