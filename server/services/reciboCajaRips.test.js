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
  { id: 'consulta', cupsCode: '890203', valorNeto: 50000, fechaEvolucion: '2026-10-01 09:00', cie10: 'K02.1', firmada: true },
  { id: 'carilla-1', cupsCode: '232102', valorNeto: 100000, fechaEvolucion: '2026-10-08 10:00', cie10: 'K02.1', firmada: true },
  { id: 'carilla-2', cupsCode: '232102', valorNeto: 100000, fechaEvolucion: '2026-10-15 10:00', cie10: 'K02.1', firmada: true },
  { id: 'carilla-3', cupsCode: '232102', valorNeto: 100000, fechaEvolucion: '2026-10-20 11:00', cie10: 'K02.1', firmada: true },
  { id: 'carilla-4', cupsCode: '232102', valorNeto: 100000, fechaEvolucion: '2026-10-22 11:30', cie10: 'K02.1', firmada: true },
  { id: 'profilaxis', cupsCode: '997103', valorNeto: 80000, fechaEvolucion: '2026-10-26 15:00', cie10: 'K05.1', firmada: true },
]

const evolucionesAnticipo = [
  { id: 'consulta', cupsCode: '890201', valorNeto: 50000, fechaEvolucion: '2026-09-26', cie10: 'K02.1', firmada: true, descripcion: 'Consulta' },
  { id: 'resina', cupsCode: '232101', valorNeto: 150000, fechaEvolucion: '2026-10-01', cie10: 'K02.1', firmada: true, descripcion: 'Resina' },
  { id: 'profilaxis', cupsCode: '997103', valorNeto: 80000, fechaEvolucion: '2026-10-25', cie10: 'K05.1', firmada: true, descripcion: 'Profilaxis' },
]

const reciboAnticipo = {
  numero: '001',
  fechaExpedicion: '2026-09-26',
  valorTotal: 280000,
}

test('un recibo agrupa consulta y procedimientos de varias fechas en un solo JSON', () => {
  const paquete = compilarRipsReciboCaja({ recibo, evoluciones, paciente, prestador })
  const servicios = paquete.rips.usuarios[0].servicios

  assert.equal(paquete.identificadorPaquete, 'RC-15')
  assert.equal(paquete.fechaRecaudo, '2026-10-26 16:00')
  assert.equal(paquete.fechaCorte, '2026-10-26 16:00')
  assert.equal(paquete.anticipo, false)
  assert.equal(paquete.rips.numFactura, null)
  assert.equal('fechaCorte' in paquete.rips, false)
  assert.equal('fechaExpedicionFactura' in paquete.rips, false)
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

test('un anticipo conserva el consecutivo y mueve la cabecera a la última evolución', () => {
  const paquete = compilarRipsReciboCaja({
    recibo: reciboAnticipo,
    evoluciones: evolucionesAnticipo,
    paciente,
    prestador,
  })
  const servicios = paquete.rips.usuarios[0].servicios

  assert.equal(paquete.identificadorPaquete, '001')
  assert.equal(paquete.fechaRecaudo, '2026-09-26')
  assert.equal(paquete.fechaCorte, '2026-10-25 12:00')
  assert.equal(paquete.fechaExpedicion, '2026-10-25 12:00')
  assert.equal(paquete.anticipo, true)
  assert.equal(paquete.rips.numFactura, null)
  assert.equal(servicios.consultas[0].codConsulta, '890201')
  assert.equal(servicios.consultas[0].fechaInicioAtencion, '2026-09-26 12:00')
  assert.equal(servicios.procedimientos[0].codProcedimiento, '232101')
  assert.equal(servicios.procedimientos[0].fechaInicioAtencion, '2026-10-01 12:00')
  assert.equal(servicios.procedimientos[1].fechaInicioAtencion, '2026-10-25 12:00')
  assert.equal(esConsultaCups('893106'), false)
})

test('el día de transmitir reemplaza la cabecera solo si ya alcanzó la última evolución', () => {
  const tarde = compilarRipsReciboCaja({
    recibo: reciboAnticipo,
    evoluciones: evolucionesAnticipo,
    paciente,
    prestador,
    fechaTransmision: '2026-10-25',
  })
  assert.equal(tarde.fechaCorte, '2026-10-25 23:59')
  assert.equal(tarde.rips.usuarios[0].servicios.procedimientos[1].fechaInicioAtencion, '2026-10-25 12:00')

  assert.throws(
    () =>
      compilarRipsReciboCaja({
        recibo: reciboAnticipo,
        evoluciones: evolucionesAnticipo,
        paciente,
        prestador,
        fechaTransmision: '2026-09-26',
      }),
    (error) => error instanceof ReciboCajaRipsError && error.code === 'FECHA_TRANSMISION',
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
        assert.equal(data.fechaExpedicion, '2026-10-26 16:00')
        assert.equal(data.fechaCorteRips, '2026-10-26 16:00')
        assert.equal(data.estado, 'PENDIENTE_TRANSMISION')
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

test('el anticipo firmado se radica una vez con la fecha de corte y el recaudo intacto', async () => {
  const enviados = []
  const resultado = await cobrarYRadicarReciboCaja(
    {
      usuarioTitularId: '6f1b1f4a-8c0d-4e3a-9b2c-1a2b3c4d5e6f',
      recibo: reciboAnticipo,
      evoluciones: evolucionesAnticipo,
      paciente,
      prestador,
      fechaTransmision: '2026-10-25',
    },
    {
      guardar: async (data) => {
        assert.equal(data.fechaExpedicion, '2026-09-26')
        assert.equal(data.fechaCorteRips, '2026-10-25 23:59')
        assert.equal(data.rips.numFactura, null)
        assert.equal(Object.hasOwn(data.rips, 'fechaCorte'), false)
        assert.equal(data.rips.usuarios[0].servicios.consultas[0].fechaInicioAtencion, '2026-09-26 12:00')
        assert.equal(data.rips.usuarios[0].servicios.procedimientos[1].fechaInicioAtencion, '2026-10-25 12:00')
        return { id: 'recibo-001', numero_soporte: '001' }
      },
      enviar: async (envelope) => {
        enviados.push(envelope)
        assert.equal(Object.hasOwn(envelope.rips, 'fechaCorte'), false)
        return { httpStatus: 201, cuv: 'CUV-001' }
      },
      guardarCuv: async () => {},
    },
  )

  assert.equal(enviados.length, 1)
  assert.equal(resultado.solicitudesMuv, 1)
  assert.equal(resultado.transmitido, true)
  assert.equal(resultado.fechaRecaudo, '2026-09-26')
  assert.equal(resultado.fechaCorte, '2026-10-25 23:59')
  assert.equal(resultado.identificadorPaquete, '001')
  assert.equal(resultado.cuv, 'CUV-001')
})

test('un paquete sin firmar queda pendiente y no se envía al MUV', async () => {
  const enviados = []
  const guardados = []
  const resultado = await cobrarYRadicarReciboCaja(
    {
      usuarioTitularId: '6f1b1f4a-8c0d-4e3a-9b2c-1a2b3c4d5e6f',
      recibo: reciboAnticipo,
      paciente,
      prestador,
      fechaTransmision: '2026-09-26',
      evoluciones: [
        evolucionesAnticipo[0],
        { ...evolucionesAnticipo[1], firmada: false, estado: 'SIN_FIRMAR' },
        evolucionesAnticipo[2],
      ],
    },
    {
      guardar: async (data) => {
        guardados.push(data)
        assert.equal(data.fechaExpedicion, '2026-09-26')
        assert.equal(data.fechaCorteRips, null)
        assert.equal(data.estado, 'PENDIENTE_TRANSMISION')
        assert.equal(data.rips, null)
        return { id: 'recibo-anticipo', numero_soporte: '001' }
      },
      enviar: async (envelope) => {
        enviados.push(envelope)
        return { httpStatus: 200, cuv: 'NO-DEBE' }
      },
    },
  )

  assert.equal(enviados.length, 0)
  assert.equal(guardados.length, 1)
  assert.equal(resultado.solicitudesMuv, 0)
  assert.equal(resultado.transmitido, false)
  assert.equal(resultado.estado, 'PENDIENTE_TRANSMISION')
  assert.equal(resultado.code, 'PAQUETE_INCOMPLETO')
  assert.equal(resultado.identificadorPaquete, '001')
  assert.equal(resultado.cuv, null)
})

test('transmitir antes de la última evolución no llama al MUV', async () => {
  const enviados = []
  const resultado = await cobrarYRadicarReciboCaja(
    {
      usuarioTitularId: '6f1b1f4a-8c0d-4e3a-9b2c-1a2b3c4d5e6f',
      recibo: reciboAnticipo,
      evoluciones: evolucionesAnticipo,
      paciente,
      prestador,
      fechaTransmision: '2026-09-26',
    },
    {
      guardar: async () => ({ id: 'recibo-anticipo', numero_soporte: '001' }),
      enviar: async (envelope) => {
        enviados.push(envelope)
        return { httpStatus: 200, cuv: 'NO-DEBE' }
      },
    },
  )

  assert.equal(enviados.length, 0)
  assert.equal(resultado.transmitido, false)
  assert.equal(resultado.code, 'FECHA_TRANSMISION')
  assert.equal(resultado.estado, 'PENDIENTE_TRANSMISION')
})

test('la migración separa el recaudo de la fecha de corte del RIPS', async () => {
  const sql = await readFile(
    join(dirname(fileURLToPath(import.meta.url)), '../db/migrations/20261026235500_recibos_caja_rips_sin_factura.sql'),
    'utf8',
  )
  assert.match(sql, /ADD COLUMN IF NOT EXISTS cuv TEXT/)
  assert.match(sql, /ADD COLUMN IF NOT EXISTS fecha_expedicion/)
  assert.match(sql, /COBRADO_PROCESADO/)

  const anticipo = await readFile(
    join(dirname(fileURLToPath(import.meta.url)), '../db/migrations/20261027010000_recibo_anticipo_transmision.sql'),
    'utf8',
  )
  assert.match(anticipo, /ADD COLUMN IF NOT EXISTS fecha_corte_rips/)
  assert.match(anticipo, /PENDIENTE_TRANSMISION/)
  const repositorio = await readFile(
    join(dirname(fileURLToPath(import.meta.url)), 'cobroConsecutivosRepository.js'),
    'utf8',
  )
  assert.match(repositorio, /20261027010000_recibo_anticipo_transmision\.sql/)
})
