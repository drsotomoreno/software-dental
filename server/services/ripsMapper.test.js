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

  assert.throws(
    () => mapper.toRipsSinFactura(consultaOdontologica({ valorPagadoPaciente: 0, id: 'consulta-0' })),
    (error) => error instanceof RipsMapperError && error.field === 'vrServicio' && /RVC091/.test(error.message),
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

test('un fin de atención ilegible no llega a armar el JSON', () => {
  const mapper = new RipsMapper(PRESTADOR, { MINSALUD_ENV: 'production' })
  assert.throws(
    () => mapper.toRipsSinFactura(consultaOdontologica({ fechaFinAtencion: 'ayer' })),
    (error) => error instanceof RipsMapperError && error.field === 'fechaFinAtencion',
  )
})
