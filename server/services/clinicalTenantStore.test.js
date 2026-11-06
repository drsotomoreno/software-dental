import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { clinicScopeSql } from './clinicalTenantStore.js'

const migrationPath = join(
  dirname(fileURLToPath(import.meta.url)),
  '../db/migrations/20261102150000_pacientes_historias_clinicas.sql',
)

test('migración define pacientes e historias_clinicas con sync y firma profesional', async () => {
  const sql = await readFile(migrationPath, 'utf8')
  assert.match(sql, /CREATE TABLE IF NOT EXISTS pacientes/)
  assert.match(sql, /CREATE TABLE IF NOT EXISTS historias_clinicas/)
  assert.match(sql, /idx_paciente_documento_clinica/)
  assert.match(sql, /idx_historias_sync/)
  assert.match(sql, /idx_pacientes_sync/)
  assert.match(sql, /deleted_at/)
  assert.match(sql, /firma_rethus/)
  assert.match(sql, /firmado_en/)
  assert.match(sql, /historias_clinicas_firma_cierre_chk/)
  assert.doesNotMatch(sql, /patient_signature|firma_paciente|patientSignature/i)
})

test('clinicScopeSql omite filtro para Superadmin', () => {
  const scope = clinicScopeSql({ is_superadmin: true, clinica_id: null })
  assert.equal(scope.clause, 'TRUE')
  assert.deepEqual(scope.params, [])
})

test('clinicScopeSql exige clinica_id para usuarios normales', () => {
  const scope = clinicScopeSql({ is_superadmin: false, clinica_id: '11111111-1111-1111-1111-111111111111' })
  assert.match(scope.clause, /clinica_id = \$1::uuid/)
  assert.equal(scope.params.length, 1)
  assert.throws(() => clinicScopeSql({ is_superadmin: false, clinica_id: null }), /clinica_id/)
})
