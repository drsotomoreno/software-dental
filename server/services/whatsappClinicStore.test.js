import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const DIR = dirname(fileURLToPath(import.meta.url))
const migration = join(DIR, '../db/migrations/20261124180000_whatsapp_chatbot_module.sql')
const routes = join(DIR, '../routes/whatsapp.routes.js')
const boldController = join(DIR, '../controllers/bold.controller.js')
const serverEntry = join(DIR, '../../server.js')

test('migración WhatsApp agrega columnas de clínica y tablas del módulo', async () => {
  const sql = await readFile(migration, 'utf8')
  assert.match(sql, /whatsapp_phone_number_id/)
  assert.match(sql, /whatsapp_waba_id/)
  assert.match(sql, /whatsapp_access_token/)
  assert.match(sql, /whatsapp_connected/)
  assert.match(sql, /reminders_balance/)
  assert.match(sql, /chatbot_sessions_balance/)
  assert.match(sql, /chatbot_enabled/)
  assert.match(sql, /reminder_48h_sent_at/)
  assert.match(sql, /reminder_24h_sent_at/)
  assert.match(sql, /confirmed_by_patient/)
  assert.match(sql, /CREATE TABLE IF NOT EXISTS no_show_followups/)
  assert.match(sql, /pending_manual_call/)
  assert.match(sql, /CREATE TABLE IF NOT EXISTS whatsapp_purchases/)
  assert.match(sql, /CREATE TABLE IF NOT EXISTS whatsapp_chat_sessions/)
  assert.match(sql, /window_expires_at/)
})

test('rutas WhatsApp exponen status, checkout y no-shows', async () => {
  const src = await readFile(routes, 'utf8')
  assert.match(src, /\/status/)
  assert.match(src, /\/checkout/)
  assert.match(src, /\/no-shows/)
  assert.match(src, /requirePaidWhatsappSubscription/)
  assert.match(src, /verificarToken/)
})

test('webhook Bold acredita paquetes kind=whatsapp_package', async () => {
  const src = await readFile(boldController, 'utf8')
  assert.match(src, /creditWhatsappPurchase/)
  assert.match(src, /whatsapp_package/)
})

test('server.js monta /api/whatsapp', async () => {
  const src = await readFile(serverEntry, 'utf8')
  assert.match(src, /whatsappRoutes/)
  assert.match(src, /\/api\/whatsapp/)
})
