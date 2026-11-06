import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const migrationPath = join(
  dirname(fileURLToPath(import.meta.url)),
  '../db/migrations/20261102143000_clinicas_usuarios_rbac.sql',
)

test('migración RBAC define clinicas, usuarios e is_superadmin blindado', async () => {
  const sql = await readFile(migrationPath, 'utf8')
  assert.match(sql, /CREATE TABLE IF NOT EXISTS clinicas/)
  assert.match(sql, /CREATE TABLE IF NOT EXISTS usuarios/)
  assert.match(sql, /is_superadmin/)
  assert.match(sql, /codigo_reps/)
  assert.match(sql, /doctormauriciosoto@gmail\.com/)
  assert.match(sql, /usuarios_superadmin_email_chk/)
  assert.match(sql, /idx_usuarios_single_superadmin/)
  assert.match(sql, /idx_usuarios_clinica/)
})
