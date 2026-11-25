import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const DIR = dirname(fileURLToPath(import.meta.url))
const root = join(DIR, '../..')

test('HomePage agrega tarjeta WhatsApp con grid xl:5 y badge inasistencias', async () => {
  const src = await readFile(join(DIR, 'HomePage.tsx'), 'utf8')
  assert.match(src, /WhatsApp y Chatbot/)
  assert.match(src, /xl:grid-cols-5/)
  assert.match(src, /pending_manual_call|pendingNoShows|badgeCount/)
  assert.match(src, /whatsapp-chatbot\?section=/)
  assert.match(src, /accent: 'whatsapp'/)
})

test('ruta /whatsapp-chatbot registrada en ClinicalApp', async () => {
  const src = await readFile(join(DIR, '../ClinicalApp.tsx'), 'utf8')
  assert.match(src, /whatsapp-chatbot/)
  assert.match(src, /WhatsAppChatbotPage/)
})

test('botón manual wa.me de agenda permanece intacto', async () => {
  const src = await readFile(
    join(root, 'src/components/agenda/WhatsAppReminderButton.tsx'),
    'utf8',
  )
  assert.match(src, /buildWhatsAppUrl/)
  assert.doesNotMatch(src, /fetchWhatsappStatus|\/api\/whatsapp/)
})

test('PatientWhatsAppButton manual permanece intacto', async () => {
  const src = await readFile(
    join(root, 'src/components/clinical/PatientWhatsAppButton.tsx'),
    'utf8',
  )
  assert.match(src, /buildWhatsAppUrl|wa\.me|WhatsApp/)
  assert.doesNotMatch(src, /\/api\/whatsapp\/checkout/)
})
