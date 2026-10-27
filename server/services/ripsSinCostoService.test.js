import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ReciboCajaRipsError, compilarRipsReciboCaja } from './reciboCajaRips.js'
import { RipsMapper } from './ripsMapper.js'
import {
  MUV_SIN_COSTO_PRODUCCION,
  SQL_INSERTAR_ATENCION_SIN_COSTO,
  SQL_VINCULAR_SIN_COSTO,
  cerrarYTransmitirRipsSinCosto,
  lineasRipsDeEvolucion,
} from './ripsSinCostoService.js'

const prestador = {
  documentType: 'CC',
  documentNumber: '1234567890',
  providerNit: '900123456',
  repsCode: '6800103898-01',
}

const paciente = {
  documentType: 'CC',
  documentNumber: '52987654',
  birthDate: '1992-03-14',
  gender: 'F',
  regime: 'contributivo',
  municipalityCode: '68001',
}

const evolucion = {
  id: 'evo-control',
  cupsCode: '890303',
  catalogServices: [{ cupsCode: '232102', requiereCupsRips: true }],
  valorNeto: 50000,
  valorProcedimiento: 80000,
  fechaEvolucion: '2026-10-26 11:00',
  cie10: 'K02.1',
  firmada: true,
  es_sin_costo: true,
  motivoSinCosto: 'control',
  descripcion: 'Control de garantía',
}

test('la opción A anula el nominal y el agrupador CTRL-050 cuadra en cero', () => {
  const paquete = compilarRipsReciboCaja({
    sinCosto: true,
    prefijo: 'CTRL-',
    recibo: {
      numero: 'CTRL-050',
      prefijo: 'CTRL-',
      fechaExpedicion: '2026-10-26 11:00',
      valorTotal: 0,
    },
    evoluciones: [evolucion],
    paciente,
    prestador,
  })
  const consulta = paquete.rips.usuarios[0].servicios.consultas[0]

  assert.equal(paquete.sinCosto, true)
  assert.equal(paquete.identificadorPaquete, 'CTRL-050')
  assert.equal(paquete.rips.identificadorPaquete, 'CTRL-050')
  assert.equal(paquete.rips.numFactura, null)
  assert.equal(paquete.valorTotal, 0)
  assert.equal(paquete.rips.usuarios[0].tipoUsuario, '04')
  assert.equal(consulta.vrServicio, 0)
  assert.equal(consulta.valorProcedimiento, 0)
  assert.equal(consulta.valorDescuento, 0)
  assert.equal(consulta.valorNeto, 0)
  assert.equal(consulta.conceptoRecaudo, '05')
  assert.equal(consulta.valorPagoModerador, 0)
  assert.equal(consulta.numFEVPagoModerador, null)
})

test('un total en cero no bloquea si los detalles también suman cero', () => {
  const paquete = compilarRipsReciboCaja({
    recibo: { numero: 'RC-0', fechaExpedicion: '2026-10-26 11:00', valorTotal: 0 },
    evoluciones: [{
      id: 'evo-0',
      cupsCode: '232102',
      valorNeto: 0,
      fechaEvolucion: '2026-10-26 11:00',
      cie10: 'K021',
      firmada: true,
    }],
    paciente,
    prestador,
  })
  assert.equal(paquete.rips.usuarios[0].servicios.procedimientos[0].vrServicio, 0)
  assert.equal(paquete.valorTotal, 0)

  assert.throws(
    () => compilarRipsReciboCaja({
      recibo: { numero: 'RC-0', fechaExpedicion: '2026-10-26 11:00', valorTotal: 0 },
      evoluciones: [{
        id: 'evo-nominal',
        cupsCode: '232102',
        valorNeto: 50000,
        fechaEvolucion: '2026-10-26 11:00',
        cie10: 'K021',
        firmada: true,
      }],
      paciente,
      prestador,
    }),
    (error) => error instanceof ReciboCajaRipsError && error.code === 'SUMA_RIPS',
  )
})

test('cerrar la evolución persiste el agrupador en cero y hace un solo POST', async () => {
  const enviados = []
  const guardados = []
  const cuvs = []
  const resultado = await cerrarYTransmitirRipsSinCosto(
    {
      usuarioTitularId: '6f1b1f4a-8c0d-4e3a-9b2c-1a2b3c4d5e6f',
      motivo: 'Garantía',
      consecutivo: 2,
      evoluciones: [{ ...evolucion, id: 'evo-gar', motivoSinCosto: 'garantia', cupsCode: '232102', catalogServices: [] }],
      paciente,
      prestador,
    },
    {
      guardar: async (data) => {
        guardados.push(data)
        return { id: 'agrupador-1', numero_soporte: data.numero }
      },
      enviar: async (envelope) => {
        enviados.push(envelope)
        return { httpStatus: 200, cuv: 'CUV-CTRL' }
      },
      guardarCuv: async (data) => {
        cuvs.push(data)
      },
    },
  )

  assert.equal(guardados.length, 1)
  assert.equal(guardados[0].valorTotal, 0)
  assert.equal(guardados[0].estado, 'PROCESADO')
  assert.equal(guardados[0].prefijo, 'GAR-')
  assert.equal(guardados[0].numero, 'GAR-002')
  assert.equal(guardados[0].rips.identificadorPaquete, 'GAR-002')
  assert.equal(guardados[0].rips.usuarios[0].servicios.procedimientos[0].valorNeto, 0)
  assert.equal(guardados[0].rips.usuarios[0].tipoUsuario, '04')
  assert.equal(enviados.length, 1)
  assert.equal(resultado.cuv, 'CUV-CTRL')
  assert.equal(resultado.estadoAtencion, 'PROCESADO')
  assert.equal(resultado.transmitido, true)
  assert.equal(resultado.endpoint, MUV_SIN_COSTO_PRODUCCION)
  assert.match(MUV_SIN_COSTO_PRODUCCION, /^https:\/\/fevrips\.sispro\.gov\.co\/fevrips-api\//)
  assert.deepEqual(cuvs, [{ id: 'agrupador-1', cuv: 'CUV-CTRL' }])
  assert.equal(lineasRipsDeEvolucion(evolucion).length, 2)
})

test('un reintento usa el mismo CTRL o GAR y no reserva otro consecutivo', async () => {
  let guardados = 0
  const resultado = await cerrarYTransmitirRipsSinCosto(
    {
      retransmitir: true,
      numero: 'GAR-002',
      reciboId: 'agrupador-1',
      motivo: 'garantia',
      evoluciones: [{ ...evolucion, id: 'evo-gar', cupsCode: '232102', catalogServices: [] }],
      paciente,
      prestador,
    },
    {
      guardar: async () => {
        guardados += 1
        return { id: 'otro' }
      },
      enviar: async (envelope) => {
        assert.equal(envelope.rips.identificadorPaquete, 'GAR-002')
        assert.equal(envelope.rips.usuarios[0].servicios.procedimientos[0].valorNeto, 0)
        return { httpStatus: 200, cuv: 'CUV-2' }
      },
      guardarCuv: async () => {},
    },
  )
  assert.equal(guardados, 0)
  assert.equal(resultado.identificadorPaquete, 'GAR-002')
  assert.equal(resultado.recibo.id, 'agrupador-1')
  assert.equal(resultado.cuv, 'CUV-2')
})

test('sin firma no crea el agrupador ni llama al MUV', async () => {
  let guardados = 0
  await assert.rejects(
    () => cerrarYTransmitirRipsSinCosto(
      {
        motivo: 'control',
        evoluciones: [{ ...evolucion, firmada: false, sinFirmar: true }],
        paciente,
        prestador,
      },
      {
        guardar: async () => {
          guardados += 1
          return { id: 'no' }
        },
        enviar: async () => ({ httpStatus: 200, cuv: 'NO' }),
      },
    ),
    (error) => error instanceof ReciboCajaRipsError && error.code === 'FIRMA',
  )
  assert.equal(guardados, 0)
})

test('el mapper de una consulta marcada sin costo no aplica RVC091', () => {
  const mapper = new RipsMapper(prestador, { MINSALUD_ENV: 'production' })
  const rips = mapper.toRipsSinFactura({
    id: 'consulta-0',
    es_sin_costo: true,
    paciente: { ...paciente, regime: 'contributivo' },
    profesional: { documentType: 'CC', documentNumber: '1234567890' },
    fechaInicioAtencion: '2026-10-26 11:00',
    diagnoses: [{ code: 'K02.1', type: 'principal', certainty: 'confirmado' }],
    cupsCode: '890303',
    valorPagadoPaciente: 50000,
    codPrestador: '680010389801',
    numDocumentoIdObligado: '900123456',
  })
  const consulta = rips.usuarios[0].servicios.consultas[0]
  assert.equal(rips.usuarios[0].tipoUsuario, '04')
  assert.equal(consulta.vrServicio, 0)
  assert.equal(consulta.valorProcedimiento, 0)
  assert.equal(consulta.valorDescuento, 0)
  assert.equal(consulta.valorNeto, 0)
  assert.equal(consulta.conceptoRecaudo, '05')
})

test('la migración reconoce el estado Procesado del agrupador sin costo', async () => {
  const sql = await readFile(
    join(dirname(fileURLToPath(import.meta.url)), '../db/migrations/20261027023000_rips_sin_costo_procesado.sql'),
    'utf8',
  )
  assert.match(sql, /PROCESADO/)
  assert.match(sql, /CTRL-/)
  assert.match(SQL_VINCULAR_SIN_COSTO, /estado_rips = 'PROCESADO'/)
  assert.match(SQL_VINCULAR_SIN_COSTO, /valor_procedimiento = 0/)
  assert.match(SQL_INSERTAR_ATENCION_SIN_COSTO, /'PROCESADO'/)
  const repositorio = await readFile(
    join(dirname(fileURLToPath(import.meta.url)), 'cobroConsecutivosRepository.js'),
    'utf8',
  )
  assert.match(repositorio, /20261027023000_rips_sin_costo_procesado\.sql/)
})
