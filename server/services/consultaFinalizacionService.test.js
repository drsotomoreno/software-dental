import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  finalizarConsultaEnMuv,
  interpretarRespuestaMuv,
} from './consultaFinalizacionService.js'
import {
  SQL_ACTUALIZAR_ESTADO_MUV,
  SQL_INSERTAR_CONSULTA_CLINICA,
  splitSqlStatements,
} from './consultasRepository.js'

const MIGRATION = join(
  dirname(fileURLToPath(import.meta.url)),
  '../db/migrations/20261007193000_consultas_muv.sql',
)

const CUV = 'a'.repeat(96)

function atencionValida(extra = {}) {
  return {
    id: 'consulta-1',
    paciente: {
      documentType: 'CC',
      documentNumber: '79904620',
      birthDate: '1991-06-25',
      gender: 'F',
      regime: 'particular',
      municipalityCode: '11001',
    },
    profesional: {
      documentType: 'CC',
      documentNumber: '79904620',
    },
    signedAt: '2026-10-07T14:30:00.000Z',
    diagnoses: [{ code: 'K021', type: 'principal', certainty: 'confirmado' }],
    codConsulta: '890203',
    valorPagadoPaciente: 50000,
    codPrestador: '680010389801',
    numDocumentoIdObligado: '79904620',
    ...extra,
  }
}

function memoria() {
  const rows = new Map()
  const calls = []
  return {
    rows,
    calls,
    async ensureConsultasSchema() {},
    async obtenerConsulta(id) {
      return rows.get(id) ?? null
    },
    async insertarConsultaClinica(entry) {
      calls.push('insert')
      const prev = rows.get(entry.id)
      const row = {
        id: entry.id,
        clinicId: entry.clinicId ?? prev?.clinicId ?? null,
        patientId: entry.patientId ?? prev?.patientId ?? null,
        professionalId: entry.professionalId ?? prev?.professionalId ?? null,
        clinicalRecordId: entry.clinicalRecordId ?? prev?.clinicalRecordId ?? entry.id,
        cuv: prev?.cuv ?? null,
        estadoMuv: prev?.estadoMuv ?? 'PENDIENTE',
        resultadoValidacion: prev?.resultadoValidacion ?? null,
      }
      rows.set(entry.id, row)
      return row
    },
    async actualizarEstadoMuv(entry) {
      calls.push('update')
      const prev = rows.get(entry.id)
      if (!prev) throw new Error('consulta no encontrada')
      const row = {
        ...prev,
        cuv: entry.cuv ?? null,
        estadoMuv: entry.estadoMuv,
        resultadoValidacion: entry.resultadoValidacion ?? null,
      }
      rows.set(entry.id, row)
      return row
    },
    async guardarResultadoMuv(entry) {
      const prev = rows.get(entry.id)
      const row = {
        id: entry.id,
        clinicId: entry.clinicId ?? prev?.clinicId ?? null,
        patientId: entry.patientId ?? prev?.patientId ?? null,
        professionalId: entry.professionalId ?? prev?.professionalId ?? null,
        clinicalRecordId: entry.clinicalRecordId ?? prev?.clinicalRecordId ?? entry.id,
        cuv: entry.cuv ?? null,
        estadoMuv: entry.estadoMuv,
        resultadoValidacion: entry.resultadoValidacion ?? null,
      }
      rows.set(entry.id, row)
      return row
    },
  }
}

test('el alta y el estado del MUV usan SQL parametrizado', () => {
  assert.match(SQL_INSERTAR_CONSULTA_CLINICA, /INSERT INTO consultas/)
  assert.match(SQL_INSERTAR_CONSULTA_CLINICA, /VALUES \(\$1, \$2, \$3, \$4, \$5, now\(\)\)/)
  assert.match(SQL_ACTUALIZAR_ESTADO_MUV, /UPDATE consultas/)
  assert.match(SQL_ACTUALIZAR_ESTADO_MUV, /SET cuv = \$2/)
  assert.match(SQL_ACTUALIZAR_ESTADO_MUV, /estado_muv = \$3::estado_muv/)
  assert.match(SQL_ACTUALIZAR_ESTADO_MUV, /resultado_validacion = \$4::jsonb/)
  assert.match(SQL_ACTUALIZAR_ESTADO_MUV, /WHERE id = \$1/)
  assert.doesNotMatch(SQL_INSERTAR_CONSULTA_CLINICA, /\$\{/)
  assert.doesNotMatch(SQL_ACTUALIZAR_ESTADO_MUV, /\$\{/)
})

test('la migración declara cuv, el enum del MUV y resultado_validacion jsonb', async () => {
  const sql = await readFile(MIGRATION, 'utf8')
  assert.match(sql, /CREATE TYPE estado_muv AS ENUM \('PENDIENTE', 'APROBADO', 'RECHAZADO'\)/)
  assert.match(sql, /cuv text/)
  assert.match(sql, /resultado_validacion jsonb/)
  assert.match(sql, /CREATE TABLE IF NOT EXISTS consultas/)
  assert.match(sql, /ADD COLUMN IF NOT EXISTS clinical_record_id text/)
  assert.match(sql, /ADD COLUMN IF NOT EXISTS professional_id text/)
  assert.match(sql, /ADD COLUMN IF NOT EXISTS updated_at timestamptz/)
  const statements = splitSqlStatements(sql)
  const indexAt = statements.findIndex((statement) => /idx_consultas_clinical_record/.test(statement))
  const columnAt = statements.findIndex((statement) => /ADD COLUMN IF NOT EXISTS clinical_record_id/.test(statement))
  assert.ok(columnAt >= 0 && indexAt > columnAt)
  const createType = statements.find((statement) => /CREATE TYPE estado_muv/.test(statement))
  assert.match(createType, /CREATE TYPE estado_muv AS ENUM \('PENDIENTE', 'APROBADO', 'RECHAZADO'\)/)
  assert.doesNotMatch(createType, /CREATE INDEX/)
})

test('el 503 de preparar la tabla conserva el error de PostgreSQL', async () => {
  await assert.rejects(
    () =>
      finalizarConsultaEnMuv(
        { atencion: atencionValida() },
        {
          async ensureConsultasSchema() {
            const error = new Error('column "clinical_record_id" does not exist')
            error.code = '42703'
            throw error
          },
        },
      ),
    (error) => {
      assert.equal(error.statusCode, 503)
      assert.equal(error.message, 'No se pudo preparar la tabla de consultas.')
      assert.match(error.detalle, /clinical_record_id/)
      assert.equal(error.cause.code, '42703')
      return true
    },
  )
})

test('un CUV con notificaciones queda APROBADO', () => {
  const parsed = interpretarRespuestaMuv(200, {
    ResultState: true,
    CodigoUnicoValidacion: CUV,
    ResultadosValidacion: [{ Clase: 'NOTIFICACION', Codigo: 'RVG01', Descripcion: 'aviso' }],
  })
  assert.equal(parsed.estadoMuv, 'APROBADO')
  assert.equal(parsed.cuv, CUV)
  assert.equal(parsed.resultadoValidacion.ResultadosValidacion[0].Codigo, 'RVG01')
})

test('sin CUV el estado es RECHAZADO y se conservan los errores', () => {
  const parsed = interpretarRespuestaMuv(400, {
    ResultState: false,
    ResultadosValidacion: [{ Clase: 'RECHAZADO', Codigo: 'RVC091', Descripcion: 'vrServicio' }],
  })
  assert.equal(parsed.estadoMuv, 'RECHAZADO')
  assert.equal(parsed.cuv, null)
  assert.equal(parsed.resultadoValidacion.ResultadosValidacion[0].Codigo, 'RVC091')
})

test('finalizar consulta genera el RIPS, llama al MUV y guarda el CUV', async () => {
  const repo = memoria()
  let enviado = null
  const result = await finalizarConsultaEnMuv(
    {
      atencion: atencionValida(),
      prestador: {
        nit: '79904620',
        codPrestador: '680010389801',
        tipoDocumento: 'CC',
        numeroDocumento: '79904620',
      },
      metadatos: { clinicId: 'clinica-1', patientUuid: 'paciente-1' },
      user: { id: 'prof-1' },
    },
    {
      ...repo,
      fevRipsService: {
        async enviarRipsSinFactura(payload) {
          enviado = payload
          return {
            CUV,
            resultState: true,
            resultadosValidacion: [],
          }
        },
      },
    },
  )

  assert.equal(result.estadoMuv, 'APROBADO')
  assert.equal(result.cuv, CUV)
  assert.deepEqual(repo.calls, ['insert', 'update'])
  assert.equal(enviado.numFactura, null)
  assert.equal(enviado.usuarios[0].servicios.consultas[0].codDiagnosticoPrincipal, 'K021')
  assert.equal(enviado.usuarios[0].servicios.consultas[0].vrServicio, 50000)
  assert.equal(repo.rows.get('consulta-1').estadoMuv, 'APROBADO')
  assert.equal(repo.rows.get('consulta-1').cuv, CUV)
})

test('un rechazo del MUV queda en la consulta', async () => {
  const repo = memoria()
  const result = await finalizarConsultaEnMuv(
    { atencion: atencionValida({ id: 'consulta-2' }) },
    {
      ...repo,
      fevRipsService: {
        async enviarRipsSinFactura() {
          return {
            CUV: null,
            resultState: false,
            resultadosValidacion: [{ Clase: 'RECHAZADO', Codigo: 'RVG01' }],
          }
        },
      },
    },
  )
  assert.equal(result.clinicoGuardado, true)
  assert.equal(result.estadoMuv, 'RECHAZADO')
  assert.equal(result.cuv, null)
  assert.equal(repo.rows.get('consulta-2').resultadoValidacion[0].Codigo, 'RVG01')
  assert.deepEqual(repo.calls, ['insert', 'update'])
})

test('notificaciones sin CUV quedan RECHAZADO y el array se guarda', async () => {
  const repo = memoria()
  const avisos = [{ Clase: 'NOTIFICACION', Codigo: 'RVG08', Descripcion: 'aviso' }]
  const result = await finalizarConsultaEnMuv(
    { atencion: atencionValida({ id: 'consulta-avisos' }) },
    {
      ...repo,
      minsaludService: {
        async enviarRipsSinFactura() {
          return { CUV: null, resultState: true, resultadosValidacion: avisos }
        },
      },
    },
  )
  assert.equal(result.clinicoGuardado, true)
  assert.equal(result.estadoMuv, 'RECHAZADO')
  assert.equal(result.cuv, null)
  assert.equal(repo.rows.get('consulta-avisos').resultadoValidacion[0].Codigo, 'RVG08')
})

test('un vrServicio en 0 no llama al MUV, guarda RECHAZADO y no interrumpe el cierre', async () => {
  const repo = memoria()
  let llamadas = 0
  const result = await finalizarConsultaEnMuv(
    { atencion: atencionValida({ id: 'consulta-3', valorPagadoPaciente: 0 }) },
    {
      ...repo,
      fevRipsService: {
        async enviarRipsSinFactura() {
          llamadas += 1
          return { CUV: null, resultState: false, resultadosValidacion: [] }
        },
      },
    },
  )
  assert.equal(llamadas, 0)
  assert.equal(result.clinicoGuardado, true)
  assert.equal(result.estadoMuv, 'RECHAZADO')
  assert.equal(repo.rows.get('consulta-3').estadoMuv, 'RECHAZADO')
  assert.match(repo.rows.get('consulta-3').resultadoValidacion.error, /RVC091/)
  assert.deepEqual(repo.calls, ['insert', 'update'])
})

test('una consulta ya aprobada no se reenvía al MUV', async () => {
  const repo = memoria()
  await repo.guardarResultadoMuv({
    id: 'consulta-4',
    cuv: CUV,
    estadoMuv: 'APROBADO',
    resultadoValidacion: { ResultState: true },
  })
  let llamadas = 0
  const result = await finalizarConsultaEnMuv(
    { atencion: atencionValida({ id: 'consulta-4' }) },
    {
      ...repo,
      fevRipsService: {
        async enviarRipsSinFactura() {
          llamadas += 1
          return { httpStatus: 200, data: {} }
        },
      },
    },
  )
  assert.equal(llamadas, 0)
  assert.equal(result.alreadyStored, true)
  assert.equal(result.cuv, CUV)
})
