import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const SERVICE = join(dirname(fileURLToPath(import.meta.url)), 'clinicAssistantLimit.js')

const MIGRATION = join(
  dirname(fileURLToPath(import.meta.url)),
  '../db/migrations/20261027160000_clinics_custom_max_assistants.sql',
)

test('la migración agrega custom_max_assistants en clinics', async () => {
  const sql = await readFile(MIGRATION, 'utf8')
  assert.match(sql, /CREATE TABLE IF NOT EXISTS clinics/)
  assert.match(sql, /ADD COLUMN IF NOT EXISTS custom_max_assistants INT DEFAULT NULL/)
  assert.match(sql, /ADD COLUMN IF NOT EXISTS custom_max_rethus INT DEFAULT NULL/)
  assert.match(sql, /ALTER TABLE clinics/)
  assert.match(sql, /Solo lo aplica el plan corporativo/)
})

test('la lectura compara el id de la clínica como texto', async () => {
  const source = await readFile(SERVICE, 'utf8')
  assert.match(
    source,
    /SELECT custom_max_assistants, custom_max_rethus FROM clinics WHERE id::text = \$1 LIMIT 1/,
  )
})
