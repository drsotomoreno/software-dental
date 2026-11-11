import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const DIR = dirname(fileURLToPath(import.meta.url))
const pacientesMigration = join(DIR, '../db/migrations/20261102150000_pacientes_historias_clinicas.sql')
const cleanupMigration = join(DIR, '../db/migrations/20261111170000_cleanup_ghost_tables.sql')

test('migración de pacientes ya no crea historias_clinicas (tabla fantasma)', async () => {
  const sql = await readFile(pacientesMigration, 'utf8')
  assert.match(sql, /CREATE TABLE IF NOT EXISTS pacientes/)
  assert.match(sql, /idx_paciente_documento_clinica/)
  assert.match(sql, /idx_pacientes_sync/)
  assert.match(sql, /deleted_at/)
  assert.doesNotMatch(sql, /CREATE TABLE IF NOT EXISTS historias_clinicas/)
  assert.doesNotMatch(sql, /patient_signature|firma_paciente|patientSignature/i)
})

test('migración cleanup elimina historias_clinicas', async () => {
  const sql = await readFile(cleanupMigration, 'utf8')
  assert.match(sql, /DROP TABLE IF EXISTS historias_clinicas/)
  assert.doesNotMatch(sql, /DROP TABLE IF EXISTS pacientes/)
  assert.doesNotMatch(sql, /DROP TABLE IF EXISTS idx_pacientes/)
})
