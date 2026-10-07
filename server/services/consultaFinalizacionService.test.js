import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  finalizarConsultaEnMuv,
  interpretarRespuestaMuv,
} from './consultaFinalizacionService.js'

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
  return {
    rows,
    async ensureConsultasSchema() {},
    async obtenerConsulta(id) {
      return rows.get(id) ?? null
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

test('la migración declara cuv, el enum del MUV y resultado_validacion jsonb', async () => {
  const sql = await readFile(MIGRATION, 'utf8')
  assert.match(sql, /CREATE TYPE estado_muv AS ENUM \('PENDIENTE', 'APROBADO', 'RECHAZADO'\)/)
  assert.match(sql, /cuv text/)
  assert.match(sql, /resultado_validacion jsonb/)
  assert.match(sql, /CREATE TABLE IF NOT EXISTS consultas/)
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
            httpStatus: 200,
            data: {
              ResultState: true,
              CodigoUnicoValidacion: CUV,
              ResultadosValidacion: [],
              ProcesoId: 3813311,
            },
          }
        },
      },
    },
  )

  assert.equal(result.estadoMuv, 'APROBADO')
  assert.equal(result.cuv, CUV)
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
            httpStatus: 400,
            data: {
              ResultState: false,
              ResultadosValidacion: [{ Clase: 'RECHAZADO', Codigo: 'RVG01' }],
            },
          }
        },
      },
    },
  )
  assert.equal(result.estadoMuv, 'RECHAZADO')
  assert.equal(result.cuv, null)
  assert.equal(repo.rows.get('consulta-2').resultadoValidacion.ResultadosValidacion[0].Codigo, 'RVG01')
})

test('un vrServicio en 0 no llama al MUV y deja la consulta RECHAZADA', async () => {
  const repo = memoria()
  let llamadas = 0
  await assert.rejects(
    () =>
      finalizarConsultaEnMuv(
        { atencion: atencionValida({ id: 'consulta-3', valorPagadoPaciente: 0 }) },
        {
          ...repo,
          fevRipsService: {
            async enviarRipsSinFactura() {
              llamadas += 1
              return { httpStatus: 200, data: {} }
            },
          },
        },
      ),
    (error) => error?.name === 'RipsMapperError' && /RVC091/.test(error.message),
  )
  assert.equal(llamadas, 0)
  assert.equal(repo.rows.get('consulta-3').estadoMuv, 'RECHAZADO')
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
