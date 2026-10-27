import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  ESTADO_COBRADO_PROCESADO,
  MUV_SIN_FACTURA_PRODUCCION,
  ReciboCajaRipsError,
  TIPO_USUARIO_PARTICULAR,
  cobrarYRadicarReciboCaja,
  compilarRipsReciboCaja,
  esConsultaCups,
} from './reciboCajaRips.js'

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
  municipalityCode: '68001',
}

const recibo = {
  numero: 'RC-15',
  fechaExpedicion: '2026-10-26 16:00',
  valorTotal: 530000,
}

const evoluciones = [
  { id: 'consulta', cupsCode: '890203', valorNeto: 50000, fechaEvolucion: '2026-10-01 09:00', cie10: 'K02.1' },
  { id: 'carilla-1', cupsCode: '232102', valorNeto: 100000, fechaEvolucion: '2026-10-08 10:00', cie10: 'K02.1' },
  { id: 'carilla-2', cupsCode: '232102', valorNeto: 100000, fechaEvolucion: '2026-10-15 10:00', cie10: 'K02.1' },
  { id: 'carilla-3', cupsCode: '232102', valorNeto: 100000, fechaEvolucion: '2026-10-20 11:00', cie10: 'K02.1' },
  { id: 'carilla-4', cupsCode: '232102', valorNeto: 100000, fechaEvolucion: '2026-10-22 11:30', cie10: 'K02.1' },
  { id: 'profilaxis', cupsCode: '997103', valorNeto: 80000, fechaEvolucion: '2026-10-26 15:00', cie10: 'K05.1' },
]

test('un recibo agrupa consulta y procedimientos de varias fechas en un solo JSON', () => {
  const paquete = compilarRipsReciboCaja({ recibo, evoluciones, paciente, prestador })
  const servicios = paquete.rips.usuarios[0].servicios

  assert.equal(paquete.identificadorPaquete, 'RC-15')
  assert.equal(paquete.rips.numFactura, null)
  assert.equal(paquete.rips.usuarios[0].tipoUsuario, TIPO_USUARIO_PARTICULAR)
  assert.equal(JSON.stringify(paquete.rips).includes('nitEps'), false)
  assert.equal(servicios.consultas.length, 1)
  assert.equal(servicios.consultas[0].codConsulta, '890203')
  assert.equal(servicios.consultas[0].fechaInicioAtencion, '2026-10-01 09:00')
  assert.equal(servicios.consultas[0].codPrestador, '680010389801')
  assert.equal(servicios.consultas[0].consecutivo, 1)
  assert.equal(servicios.procedimientos.length, 5)
  assert.deepEqual(
    servicios.procedimientos.map((item) => item.consecutivo),
    [1, 2, 3, 4, 5],
  )
  assert.deepEqual(
    servicios.procedimientos.map((item) => item.fechaInicioAtencion),
    ['2026-10-08 10:00', '2026-10-15 10:00', '2026-10-20 11:00', '2026-10-22 11:30', '2026-10-26 15:00'],
  )
  assert.equal(esConsultaCups('893106'), false)
  const suma = [...servicios.consultas, ...servicios.procedimientos, ...servicios.otrosServicios]
    .reduce((total, item) => total + item.vrServicio, 0)
  assert.equal(suma, 530000)
})

test('aborta si una evolución es posterior al recibo o si la suma difiere un peso', () => {
  assert.throws(
    () =>
      compilarRipsReciboCaja({
        recibo,
        paciente,
        prestador,
        evoluciones: [{ ...evoluciones[0], fechaEvolucion: '2026-10-27 08:00' }],
      }),
    (error) => error instanceof ReciboCajaRipsError && error.code === 'FECHA_FUTURA',
  )
  assert.throws(
    () => compilarRipsReciboCaja({ recibo: { ...recibo, valorTotal: 530001 }, evoluciones, paciente, prestador }),
    (error) => error instanceof ReciboCajaRipsError && error.code === 'SUMA_RIPS',
  )
})

test('radica un solo POST y guarda el CUV en el recibo', async () => {
  const enviados = []
  const cuvs = []
  const resultado = await cobrarYRadicarReciboCaja(
    {
      usuarioTitularId: '6f1b1f4a-8c0d-4e3a-9b2c-1a2b3c4d5e6f',
      recibo,
      evoluciones,
      paciente,
      prestador,
    },
    {
      guardar: async (data) => {
        assert.equal(data.evolucionIds.length, 6)
        assert.equal(data.rips.numFactura, null)
        return { id: 'recibo-1', numero_soporte: 'RC-15' }
      },
      enviar: async (envelope) => {
        enviados.push(envelope)
        return { httpStatus: 200, cuv: 'CUV-RECIBO-15' }
      },
      guardarCuv: async (data) => {
        cuvs.push(data)
      },
    },
  )

  assert.equal(enviados.length, 1)
  assert.equal(enviados[0].rips.usuarios[0].servicios.procedimientos.length, 5)
  assert.equal(resultado.solicitudesMuv, 1)
  assert.equal(resultado.cuv, 'CUV-RECIBO-15')
  assert.deepEqual(cuvs, [{ id: 'recibo-1', cuv: 'CUV-RECIBO-15' }])
  assert.equal(resultado.recibo.cuv, 'CUV-RECIBO-15')
  assert.match(MUV_SIN_FACTURA_PRODUCCION, /fevrips\.sispro\.gov\.co\/fevrips-api/)
  assert.equal(ESTADO_COBRADO_PROCESADO, 'COBRADO_PROCESADO')
})

test('la migración guarda el CUV en el recibo y reconoce el cobro agrupado', async () => {
  const sql = await readFile(
    join(dirname(fileURLToPath(import.meta.url)), '../db/migrations/20261026235500_recibos_caja_rips_sin_factura.sql'),
    'utf8',
  )
  assert.match(sql, /ADD COLUMN IF NOT EXISTS cuv TEXT/)
  assert.match(sql, /ADD COLUMN IF NOT EXISTS fecha_expedicion/)
  assert.match(sql, /COBRADO_PROCESADO/)
})
