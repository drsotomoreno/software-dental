import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { splitSqlStatements } from './consultasRepository.js'

const MIGRATION = join(
  dirname(fileURLToPath(import.meta.url)),
  '../db/migrations/20261023140000_atenciones_rips_metadata.sql',
)

test('la migración agrega la metadata RIPS sin tocar el cuerpo clínico', async () => {
  const sql = await readFile(MIGRATION, 'utf8')
  assert.match(sql, /ADD COLUMN IF NOT EXISTS cod_diagnostico_principal VARCHAR\(7\)/)
  assert.match(
    sql,
    /ADD COLUMN IF NOT EXISTS tipo_vinculacion_financiera VARCHAR\(20\) NOT NULL DEFAULT 'valor_cero'/,
  )
  assert.match(sql, /ADD COLUMN IF NOT EXISTS id_recibo_asociado TEXT/)
  assert.match(sql, /ADD COLUMN IF NOT EXISTS id_factura_electronica TEXT/)
  assert.match(sql, /ADD COLUMN IF NOT EXISTS causa_motivo_atencion VARCHAR\(2\) NOT NULL DEFAULT '38'/)
  assert.match(sql, /ADD COLUMN IF NOT EXISTS finalidad_tecnologia VARCHAR\(2\) NOT NULL DEFAULT '11'/)
  assert.match(sql, /ADD COLUMN IF NOT EXISTS concepto_recaudo VARCHAR\(2\) NOT NULL DEFAULT '05'/)
  assert.match(sql, /ADD COLUMN IF NOT EXISTS rips_estado VARCHAR\(20\) NOT NULL DEFAULT 'sin_preparar'/)
  assert.match(sql, /ADD COLUMN IF NOT EXISTS cuv TEXT/)
  assert.match(sql, /ADD COLUMN IF NOT EXISTS rips_fecha_transmision TIMESTAMP WITH TIME ZONE/)
  assert.match(sql, /ADD COLUMN IF NOT EXISTS rips_error_log TEXT/)
  assert.match(sql, /CHECK \(tipo_vinculacion_financiera IN \('recibo_interno', 'fev', 'valor_cero'\)\)/)
  assert.match(sql, /CHECK \(rips_estado IN \('sin_preparar', 'preparado', 'enviado_ok', 'error'\)\)/)
  assert.doesNotMatch(sql, /clinical_note|procedure|content_hash|professional_signature/i)
})

test('los bloques DO de las restricciones no se parten por el punto y coma interno', async () => {
  const sql = await readFile(MIGRATION, 'utf8')
  const statements = splitSqlStatements(sql)
  const vinculacion = statements.find((statement) =>
    /ck_atenciones_tipo_vinculacion_financiera/.test(statement),
  )
  const estado = statements.find((statement) => /ck_atenciones_rips_estado/.test(statement))
  assert.ok(vinculacion)
  assert.match(vinculacion, /pg_constraint/)
  assert.match(vinculacion, /ADD CONSTRAINT ck_atenciones_tipo_vinculacion_financiera/)
  assert.ok(estado)
  assert.match(estado, /ADD CONSTRAINT ck_atenciones_rips_estado/)
  assert.match(estado, /sin_preparar/)
})
