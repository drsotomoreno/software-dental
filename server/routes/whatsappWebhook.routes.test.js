import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const DIR = dirname(fileURLToPath(import.meta.url))

test('webhook WhatsApp valida hub.verify_token y monta POST', async () => {
  const src = await readFile(join(DIR, 'whatsappWebhook.routes.js'), 'utf8')
  assert.match(src, /hub\.mode/)
  assert.match(src, /META_WEBHOOK_VERIFY_TOKEN/)
  assert.match(src, /CONFIRMAR_CITA/)
  assert.match(src, /NO_CONTACTAR/)
  assert.match(src, /handleChatbotInbound/)
})

test('server.js monta webhook y cron de recordatorios', async () => {
  const src = await readFile(join(DIR, '../../server.js'), 'utf8')
  assert.match(src, /\/api\/webhooks\/whatsapp/)
  assert.match(src, /startWhatsappRemindersCron/)
})

test('clinical-sync dispara espejo WhatsApp sin tocar wa.me', async () => {
  const sync = await readFile(join(DIR, '../services/clinicalSyncStore.js'), 'utf8')
  assert.match(sync, /syncAppointmentsFromClinicalPush/)
  assert.match(sync, /No afecta wa\.me manual/)

  const reminderBtn = await readFile(
    join(DIR, '../../src/components/agenda/WhatsAppReminderButton.tsx'),
    'utf8',
  )
  assert.match(reminderBtn, /buildWhatsAppUrl/)
  assert.match(reminderBtn, /wa\.me|buildWhatsAppUrl/)
})
