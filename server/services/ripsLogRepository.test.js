import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { splitSqlStatements } from './consultasRepository.js'
import {
  SQL_ACTUALIZAR_ATENCION_RIPS,
  SQL_INSERTAR_RIPS_LOG,
  actualizarAtencionRips,
  registrarRipsLog,
} from './ripsLogRepository.js'

const MIGRATION = join(
  dirname(fileURLToPath(import.meta.url)),
  '../db/migrations/20261024125200_rips_logs.sql',
)

test('la migración de rips_logs conserva payload, respuesta, CUV y prestador', async () => {
  const sql = await readFile(MIGRATION, 'utf8')
  assert.match(sql, /CREATE TABLE IF NOT EXISTS rips_logs/)
  assert.match(sql, /request_payload JSONB/)
  assert.match(sql, /response_muv JSONB/)
  assert.match(sql, /usuario_prestador JSONB/)
  assert.match(sql, /cuv TEXT/)
  assert.match(sql, /CHECK \(modo IN \('single', 'batch'\)\)/)
  assert.match(sql, /CHECK \(canal IN \('fev', 'sin_factura'\)\)/)
  assert.doesNotMatch(sql, /professional_signature|content_hash/)

  const statements = splitSqlStatements(sql)
  const modo = statements.find((statement) => /ck_rips_logs_modo/.test(statement))
  assert.match(modo, /pg_constraint/)
  assert.match(modo, /ADD CONSTRAINT ck_rips_logs_modo/)
})

test('el insert de auditoría no castea el id de evolución a uuid', () => {
  assert.match(SQL_INSERTAR_RIPS_LOG, /INSERT INTO rips_logs/)
  assert.match(SQL_INSERTAR_RIPS_LOG, /request_payload/)
  assert.match(SQL_ACTUALIZAR_ATENCION_RIPS, /evolution_note_id = \$1 OR id::text = \$1/)
  assert.match(SQL_ACTUALIZAR_ATENCION_RIPS, /WHEN \$2 = 'enviado_ok'/)
  assert.doesNotMatch(SQL_ACTUALIZAR_ATENCION_RIPS, /\$1::uuid/)
})

test('registrarRipsLog guarda el payload y omite la clave del prestador', async () => {
  const queries = []
  const client = {
    async query(sql, params) {
      queries.push({ sql, params })
      return { rows: [{ id: '8d2c1c4e-1b2a-4c3d-9e8f-112233445566', created_at: '2026-10-24T17:52:00.000Z' }] }
    },
  }

  const saved = await registrarRipsLog(
    {
      usuarioPrestador: { id: 'prestador-1', email: 'ana@clinica.test', nombre: 'Ana' },
      usuarioPrestadorId: 'prestador-1',
      nitPrestador: '79904620',
      evolutionId: 'evo-9',
      patientId: 'pac-1',
      batchId: null,
      modo: 'single',
      canal: 'sin_factura',
      httpStatus: 200,
      cuv: 'ab'.repeat(48),
      success: true,
      requestPayload: { rips: { usuarios: [] }, clave: 'no-es-la-de-sispro' },
      responseMuv: { ResultState: true },
      errors: [],
      durationMs: 120.4,
    },
    client,
  )

  assert.equal(saved.id, '8d2c1c4e-1b2a-4c3d-9e8f-112233445566')
  const params = queries[0].params
  assert.equal(params[1], 'prestador-1')
  assert.equal(params[3], 'evo-9')
  assert.equal(params[6], 'single')
  assert.equal(params[7], 'sin_factura')
  assert.equal(params[10], true)
  assert.equal(params[14], 120)
  assert.match(params[0], /ana@clinica.test/)
  assert.doesNotMatch(params[0], /clave-prueba|password/)
  assert.match(queries[0].sql, /\$6::uuid/)
})

test('la atención pasa a enviado_ok y un esquema ausente no tumba el CUV', async () => {
  const vistos = []
  const client = {
    async query(sql, params) {
      vistos.push(params)
      return { rows: [{ id: 'atencion-1' }], rowCount: 1 }
    },
  }
  const ok = await actualizarAtencionRips('evo-9', { estado: 'enviado_ok', cuv: 'CUV-1', errorLog: null }, client)
  assert.equal(ok.updated, true)
  assert.deepEqual(vistos[0], ['evo-9', 'enviado_ok', 'CUV-1', null])

  const ausente = {
    async query() {
      const error = new Error('relation "atenciones" does not exist')
      error.code = '42P01'
      throw error
    },
  }
  const faltante = await actualizarAtencionRips('evo-9', { estado: 'error', errorLog: 'RVC012 campo' }, ausente)
  assert.equal(faltante.updated, false)
  assert.equal(faltante.reason, 'esquema_ausente')

  await assert.rejects(
    () => actualizarAtencionRips('evo-9', { estado: 'PENDIENTE' }, client),
    /enviado_ok o error/,
  )
})
