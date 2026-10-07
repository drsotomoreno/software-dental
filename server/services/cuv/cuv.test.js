import assert from 'node:assert/strict'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { applyCuvMigration } from '../../db/migrate.js'
import { alertasDeEstado, clasificarEstadoCuv, sanitizeMinistryPayload } from './estado.js'
import { consultarEstadoCuv, listarExpedientes, reenviarExpediente, registrarRadicacion } from './service.js'
import { createFileCuvStore, createMemoryCuvStore } from './store.js'

const CUV = 'a'.repeat(96)

test('clasifica aprobado, notificado y rechazado', () => {
  assert.equal(clasificarEstadoCuv({ cuv: CUV, notificaciones: [], rechazos: [] }), 'aprobado')
  assert.equal(clasificarEstadoCuv({
    cuv: CUV,
    notificaciones: [{ clase: 'NOTIFICACION', codigo: 'RVC059', descripcion: 'Aviso' }],
    rechazos: [],
  }), 'notificado')
  assert.equal(clasificarEstadoCuv({
    cuv: null,
    rechazos: [{ clase: 'RECHAZADO', codigo: 'RVC023', descripcion: 'Falta dato' }],
  }), 'rechazado')
  assert.equal(clasificarEstadoCuv({
    cuv: 'No aplica a paquetes procesados en estado [RECHAZADO]',
    rechazos: [],
  }), 'rechazado')
})

test('la notificación exige atención y el rechazo también', () => {
  const avisos = alertasDeEstado({
    estado: 'notificado',
    notificaciones: [{ codigo: 'RVC059', descripcion: 'Documento informado' }],
  })
  assert.equal(avisos[0].nivel, 'atencion')
  assert.equal(avisos[0].reglas[0].codigo, 'RVC059')
  const rechazos = alertasDeEstado({
    estado: 'rechazado',
    rechazos: [{ codigo: 'RVC053', descripcion: 'Inconsistencia' }],
  })
  assert.equal(rechazos[0].nivel, 'rechazo')
  assert.match(rechazos[0].detalle, /reenvíe/i)
})

test('guarda el historial, la respuesta cruda y omite secretos', async () => {
  const store = createMemoryCuvStore()
  const primero = await registrarRadicacion({
    numFactura: 'FV1',
    numDocumentoIdObligado: '900',
    cuv: CUV,
    rips: { numFactura: 'FV1', usuarios: [] },
    respuestaCruda: { CodigoUnicoValidacion: CUV, Authorization: 'Bearer secreto', token: 'x' },
    notificaciones: [],
    rechazos: [],
    source: 'minsalud',
  }, store)
  assert.equal(primero.estado, 'aprobado')
  assert.equal(primero.puedeReenviar, true)
  assert.equal(primero.intentos[0].respuestaCruda.Authorization, undefined)
  assert.equal(primero.intentos[0].respuestaCruda.CodigoUnicoValidacion, CUV)

  const segundo = await registrarRadicacion({
    numFactura: 'FV1',
    numDocumentoIdObligado: '900',
    cuv: CUV,
    notificaciones: [{ clase: 'NOTIFICACION', codigo: 'RVC059', descripcion: 'Revisar' }],
    rechazos: [],
    respuestaCruda: { CodigoUnicoValidacion: CUV },
    source: 'minsalud',
  }, store)
  assert.equal(segundo.id, primero.id)
  assert.equal(segundo.estado, 'notificado')
  assert.equal(segundo.intentos.length, 2)
  assert.equal(segundo.alertas[0].reglas[0].codigo, 'RVC059')

  const lista = await listarExpedientes({}, store)
  assert.equal(lista[0].intentos[0].respuestaCruda, undefined)
  const consulta = await consultarEstadoCuv({ cuv: CUV }, store)
  assert.equal(consulta.expediente.estadoEtiqueta, 'Notificado')
  assert.equal(consulta.expediente.intentos[1].respuestaCruda.CodigoUnicoValidacion, CUV)
})

test('reenvía el paquete guardado y no reintenta si no hay paquete', async () => {
  const store = createMemoryCuvStore()
  const saved = await registrarRadicacion({
    numFactura: 'FV2',
    numDocumentoIdObligado: '900',
    cuv: null,
    rechazos: [{ codigo: 'RVC023', descripcion: 'Falta' }],
    rips: { numFactura: 'FV2', usuarios: [{ id: 1 }] },
    source: 'minsalud',
  }, store)
  let called = 0
  const resent = await reenviarExpediente(saved.id, {
    store,
    submit: async (payload) => {
      called += 1
      assert.equal(payload.rips.numFactura, 'FV2')
      return {
        success: true,
        cuv: CUV,
        notificaciones: [],
        rechazos: [],
        httpStatus: 200,
        respuestaCruda: { CodigoUnicoValidacion: CUV, ResultState: true },
        source: 'minsalud',
      }
    },
  })
  assert.equal(called, 1)
  assert.equal(resent.expediente.estado, 'aprobado')
  assert.equal(resent.expediente.intentos.length, 2)

  const sinPaquete = await registrarRadicacion({
    numFactura: 'FV3',
    numDocumentoIdObligado: '900',
    cuv: null,
    ministryErrors: [{ code: 'LOCAL', message: 'Incompleto' }],
  }, store)
  const blocked = await reenviarExpediente(sinPaquete.id, { store, submit: async () => { throw new Error('no debe llamar') } })
  assert.equal(blocked.status, 422)
})

test('el archivo local importa el registro legado de CUV', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cuv-'))
  const legacy = join(dir, 'cuv-registry.json')
  const next = join(dir, 'cuv-expedientes.json')
  const { writeFile } = await import('node:fs/promises')
  await writeFile(legacy, JSON.stringify([{
    id: 'legacy-1',
    cuv: CUV,
    numFactura: 'FV9',
    numDocumentoIdObligado: '800',
    status: 'approved',
    createdAt: '2026-01-01T00:00:00.000Z',
  }]), 'utf8')
  const store = createFileCuvStore(next, legacy)
  const found = await consultarEstadoCuv({ numFactura: 'FV9' }, store)
  assert.equal(found.expediente.id, 'legacy-1')
  assert.equal(found.expediente.estado, 'aprobado')
  const raw = JSON.parse(await readFile(next, 'utf8'))
  assert.equal(raw.expedientes.length, 1)
})

test('la migración crea expediente e intentos una sola vez', async () => {
  const seen = []
  const versions = new Set()
  const query = async (sql, params = []) => {
    seen.push(sql)
    if (sql.includes('SELECT version')) {
      return { rows: versions.has(params[0]) ? [{ version: params[0] }] : [] }
    }
    if (sql.includes('INSERT INTO schema_migrations')) versions.add(params[0])
    return { rows: [] }
  }
  const first = await applyCuvMigration(query)
  const second = await applyCuvMigration(query)
  assert.equal(first.applied, true)
  assert.equal(second.applied, false)
  assert.ok(seen.some((sql) => sql.includes('CREATE TABLE IF NOT EXISTS cuv_expedientes')))
  assert.ok(seen.some((sql) => sql.includes('CREATE TABLE IF NOT EXISTS cuv_intentos')))
})

test('sanitizeMinistryPayload quita credenciales anidadas', () => {
  const clean = sanitizeMinistryPayload({
    token: 'abc',
    nested: { password: 'p', codigo: 'RVC059' },
  })
  assert.equal(clean.token, undefined)
  assert.equal(clean.nested.password, undefined)
  assert.equal(clean.nested.codigo, 'RVC059')
})
