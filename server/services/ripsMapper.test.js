import assert from 'node:assert/strict'
import test from 'node:test'
import { formatFechaAtencion, RipsMapper, RipsMapperError } from './ripsMapper.js'

const PRESTADOR = {
  nit: '79904620',
  codPrestador: '680010389801',
  tipoDocumento: 'CC',
  numeroDocumento: '79904620',
}

function consultaOdontologica(extra = {}) {
  return {
    id: 'consulta-42',
    paciente: {
      documentType: 'CC',
      documentNumber: '1020708099',
      birthDate: '1991-06-25',
      gender: 'F',
      regime: 'particular',
      municipalityCode: '11001',
    },
    profesional: {
      documentType: 'CC',
      documentNumber: '79904620',
    },
    fechaInicioAtencion: '2026-10-07T14:30:00.000Z',
    fechaFinAtencion: '2026-10-07T15:10:00.000Z',
    diagnoses: [{ code: 'K02.1', type: 'principal', certainty: 'confirmado' }],
    cupsCode: '890203',
    valorPagadoPaciente: 45000,
    codPrestador: '680010389801',
    numDocumentoIdObligado: '79904620',
    ...extra,
  }
}

test('en producción arma usuarios, servicios y consultas con el documento real', () => {
  const mapper = new RipsMapper(PRESTADOR, { MINSALUD_ENV: 'production' })
  const rips = mapper.toRipsSinFactura(consultaOdontologica())
  const usuario = rips.usuarios[0]
  const consulta = usuario.servicios.consultas[0]

  assert.equal(rips.numFactura, null)
  assert.equal(rips.tipoNota, 'RS')
  assert.equal(usuario.tipoDocumentoIdentificacion, 'CC')
  assert.equal(usuario.numDocumentoIdentificacion, '1020708099')
  assert.equal(consulta.codConsulta, '890203')
  assert.equal(consulta.codDiagnosticoPrincipal, 'K021')
  assert.equal(consulta.vrServicio, 45000)
  assert.equal(consulta.fechaInicioAtencion, '2026-10-07 09:30')
  assert.match(consulta.fechaInicioAtencion, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/)
  assert.equal(formatFechaAtencion('2026-10-07T15:10:00.000Z', 'fechaFinAtencion'), '2026-10-07 10:10')
  assert.equal(consulta.numDocumentoIdentificacion, '79904620')
  assert.equal(Array.isArray(rips.usuarios), true)
  assert.equal(Array.isArray(usuario.servicios.consultas), true)

  assert.equal(
    mapper.toRipsSinFactura(consultaOdontologica({ valorPagadoPaciente: 0, id: 'consulta-0' }))
      .usuarios[0].servicios.consultas[0].vrServicio,
    0,
  )
  assert.throws(
    () =>
      mapper.toRipsSinFactura(
        consultaOdontologica({
          valorPagadoPaciente: undefined,
          valorPagado: undefined,
          id: 'consulta-null',
        }),
      ),
    (error) => error instanceof RipsMapperError && /null|indefinido|0/.test(error.message),
  )
})

test('en stage sustituye el documento del paciente por el del prestador', () => {
  const produccion = new RipsMapper(PRESTADOR, { MINSALUD_ENV: 'production' })
  const stage = new RipsMapper(PRESTADOR, { MINSALUD_ENV: 'stage' })
  const atencion = consultaOdontologica()

  const real = produccion.toRipsSinFactura(atencion)
  const bypass = stage.toRipsSinFactura(atencion)

  assert.equal(real.usuarios[0].numDocumentoIdentificacion, '1020708099')
  assert.equal(bypass.usuarios[0].tipoDocumentoIdentificacion, 'CC')
  assert.equal(bypass.usuarios[0].numDocumentoIdentificacion, '79904620')
  assert.equal(bypass.usuarios[0].servicios.consultas[0].codConsulta, '890203')
  assert.equal(bypass.usuarios[0].servicios.consultas[0].vrServicio, 45000)
  assert.notEqual(
    bypass.usuarios[0].numDocumentoIdentificacion,
    real.usuarios[0].numDocumentoIdentificacion,
  )
})

test('un NIT en blanco usa la cédula del profesional y no se detiene en el REPS vacío', () => {
  const mapper = new RipsMapper(
    {
      nit: '',
      codPrestador: '680010389801',
      tipoDocumento: 'CC',
      numeroDocumento: '79904620',
    },
    { MINSALUD_ENV: 'production' },
  )
  const rips = mapper.toRipsSinFactura(
    consultaOdontologica({
      numDocumentoIdObligado: '',
      codPrestador: '',
      profesional: {
        documentType: 'CC',
        documentNumber: '79904620',
        providerNit: '',
        repsCode: '',
      },
    }),
  )

  assert.equal(rips.numDocumentoIdObligado, '79904620')
  assert.equal(rips.usuarios[0].servicios.consultas[0].codPrestador, '680010389801')
})

test('el NIT con dígito de verificación se envía sin ese dígito', () => {
  const mapper = new RipsMapper(PRESTADOR, { MINSALUD_ENV: 'production' })
  const rips = mapper.toRipsSinFactura(
    consultaOdontologica({ numDocumentoIdObligado: '79904620-4' }),
  )
  assert.equal(rips.numDocumentoIdObligado, '79904620')
})

test('la evolución firmada usa el CUPS del nombre, admite valor 0 y omite la nota sin firmar', () => {
  const mapper = new RipsMapper(PRESTADOR, { MINSALUD_ENV: 'production' })
  const rips = mapper.toRipsSinFactura(
    consultaOdontologica({
      valorPagadoPaciente: undefined,
      cupsCode: undefined,
      codConsulta: undefined,
      evolutionNotes: [
        {
          id: 'nota-consulta',
          isLocked: true,
          date: '2026-09-29T13:48',
          signedAt: '2026-09-29T16:07:24.859Z',
          procedure: 'Consulta de primera vez por otras especialidades en odontología',
          cupsCode: null,
          cost: 0,
          catalogServices: [
            { procedure: 'Consulta de primera vez por otras especialidades en odontología' },
          ],
        },
        {
          id: 'nota-exo',
          isLocked: false,
          date: '2026-10-06T16:47',
          procedure: 'Exodoncia de dientes permanentes',
          cupsCode: null,
          cost: 0,
          catalogServices: [{ procedure: 'Exodoncia de dientes permanentes' }],
        },
      ],
    }),
  )
  const servicios = rips.usuarios[0].servicios
  assert.equal(servicios.consultas.length, 1)
  assert.equal(servicios.consultas[0].codConsulta, '890204')
  assert.equal(servicios.consultas[0].vrServicio, 0)
  assert.equal(servicios.consultas[0].fechaInicioAtencion, '2026-09-29 13:48')
  assert.equal(servicios.procedimientos, undefined)
})

test('una exodoncia firmada va a procedimientos y no se reemplaza por la consulta 890203', () => {
  const mapper = new RipsMapper(PRESTADOR, { MINSALUD_ENV: 'production' })
  const rips = mapper.toRipsSinFactura(
    consultaOdontologica({
      valorPagadoPaciente: undefined,
      cupsCode: undefined,
      codConsulta: undefined,
      evolutionNotes: [
        {
          isLocked: true,
          date: '2026-10-06T16:47',
          procedure: 'Exodoncia de dientes permanentes',
          cost: 0,
          catalogServices: [{ procedure: 'Exodoncia de dientes permanentes' }],
        },
      ],
    }),
  )
  const servicios = rips.usuarios[0].servicios
  assert.equal(servicios.consultas, undefined)
  assert.equal(servicios.procedimientos.length, 1)
  assert.equal(servicios.procedimientos[0].codProcedimiento, '230103')
  assert.equal(servicios.procedimientos[0].vrServicio, 0)
  assert.equal(servicios.procedimientos[0].fechaInicioAtencion, '2026-10-06 16:47')
})

test('un fin de atención ilegible no llega a armar el JSON', () => {
  const mapper = new RipsMapper(PRESTADOR, { MINSALUD_ENV: 'production' })
  assert.throws(
    () => mapper.toRipsSinFactura(consultaOdontologica({ fechaFinAtencion: 'ayer' })),
    (error) => error instanceof RipsMapperError && error.field === 'fechaFinAtencion',
  )
})
