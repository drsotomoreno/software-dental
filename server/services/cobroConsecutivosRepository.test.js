import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { splitSqlStatements } from './consultasRepository.js'
import {
  SQL_RESERVAR_CONSECUTIVO,
  assertReservaConsecutivo,
} from './cobroConsecutivosRepository.js'

const MIGRATION = join(
  dirname(fileURLToPath(import.meta.url)),
  '../db/migrations/20261022133400_consecutivos_prestador_atenciones.sql',
)

const TITULAR = '6f1b1f4a-8c0d-4e3a-9b2c-1a2b3c4d5e6f'

test('la migración crea el control de consecutivos, la unicidad y el pago de la atención', async () => {
  const sql = await readFile(MIGRATION, 'utf8')
  assert.match(sql, /CREATE TABLE IF NOT EXISTS consecutivos_prestador/)
  assert.match(sql, /CONSTRAINT uq_usuario_tipo_doc UNIQUE \(usuario_titular_id, tipo_documento\)/)
  assert.match(sql, /prefijo VARCHAR\(10\) NOT NULL DEFAULT 'RC-'/)
  assert.match(sql, /ultimo_consecutivo INT NOT NULL DEFAULT 0/)
  assert.match(
    sql,
    /ADD CONSTRAINT uq_recibo_titular_consecutivo\s+UNIQUE \(usuario_titular_id, tipo_documento, consecutivo\)/,
  )
  assert.match(sql, /ADD COLUMN IF NOT EXISTS pago_id UUID REFERENCES recibos_caja\(id\) ON DELETE SET NULL/)
  assert.match(sql, /ADD COLUMN IF NOT EXISTS numero_soporte_pago VARCHAR\(50\)/)
  assert.match(sql, /ADD COLUMN IF NOT EXISTS concepto_pago TEXT/)
  assert.match(sql, /ADD COLUMN IF NOT EXISTS valor_procedimiento NUMERIC\(12, 2\) DEFAULT 0/)
  assert.match(sql, /ADD COLUMN IF NOT EXISTS estado_rips VARCHAR\(30\) DEFAULT 'PENDIENTE_PAGO'/)
  assert.match(sql, /CREATE OR REPLACE FUNCTION reservar_consecutivo_prestador/)
  assert.match(sql, /ON CONFLICT \(usuario_titular_id, tipo_documento\)/)
  assert.match(sql, /CREATE OR REPLACE FUNCTION sync_estado_rips_sin_pago/)
  assert.match(sql, /CREATE TRIGGER trg_atenciones_pago_estado/)
})

test('los bloques DO y la función no se parten por el punto y coma interno', async () => {
  const sql = await readFile(MIGRATION, 'utf8')
  const statements = splitSqlStatements(sql)
  const uniqueReceipt = statements.find((statement) =>
    /uq_recibo_titular_consecutivo/.test(statement),
  )
  const reserve = statements.find((statement) =>
    /CREATE OR REPLACE FUNCTION reservar_consecutivo_prestador/.test(statement),
  )
  assert.ok(uniqueReceipt)
  assert.match(uniqueReceipt, /pg_constraint/)
  assert.match(uniqueReceipt, /ADD CONSTRAINT uq_recibo_titular_consecutivo/)
  assert.ok(reserve)
  assert.match(reserve, /RETURNING ultimo_consecutivo INTO v_consecutivo/)
  assert.match(reserve, /RETURN v_consecutivo/)
  assert.equal(statements.filter((statement) => /DECLARE/.test(statement)).length, 1)
})

test('la reserva SQL va parametrizada y valida titular, tipo y prefijo', () => {
  assert.match(SQL_RESERVAR_CONSECUTIVO, /reservar_consecutivo_prestador\(\$1::uuid, \$2, \$3\)/)
  assert.doesNotMatch(SQL_RESERVAR_CONSECUTIVO, /\$\{/)

  assert.deepEqual(
    assertReservaConsecutivo({
      usuarioTitularId: TITULAR,
      tipoDocumento: 'RECIBO_CAJA',
    }),
    { usuarioTitularId: TITULAR, tipoDocumento: 'RECIBO_CAJA', prefijo: 'RC-' },
  )

  assert.throws(
    () => assertReservaConsecutivo({ usuarioTitularId: 'user-demo-admin', tipoDocumento: 'RECIBO_CAJA' }),
    /UUID del titular/,
  )
  assert.throws(
    () => assertReservaConsecutivo({ usuarioTitularId: TITULAR, tipoDocumento: 'FACTURA' }),
    /RECIBO_CAJA o CUENTA_COBRO/,
  )
  assert.throws(
    () =>
      assertReservaConsecutivo({
        usuarioTitularId: TITULAR,
        tipoDocumento: 'CUENTA_COBRO',
        prefijo: 'PREFIJO-LARGO',
      }),
    /10 caracteres/,
  )
})
