import assert from 'node:assert/strict'
import test from 'node:test'
import { createDefaultEvolutionNoteRipsMetadata } from '../types/evolutionNoteRips.ts'
import {
  EvolutionRipsPayloadError,
  armarRipsNotaEvolucion,
  validarEnvioRipsNota,
} from './evolutionRipsPayload.ts'

const paciente = {
  documentType: 'CC',
  documentNumber: '52987654',
  birthDate: '1992-03-14',
  gender: 'F',
  regime: 'particular',
  municipalityCode: '68001',
}

const prestador = {
  documentType: 'CC',
  documentNumber: '1234567890',
  providerNit: '900123456',
  repsCode: '6800103898-01',
}

function notaFirmada(extra = {}) {
  return {
    id: 'nota-1',
    date: '2026-10-23T09:30',
    procedure: 'Obturación',
    anesthesia: { type: '', carpules: 0, vasoconstrictor: '' },
    prescriptions: '',
    professionalName: 'María González',
    professionalLicense: '1234567890',
    createdAt: '2026-10-23T14:30:00.000Z',
    isLocked: true,
    signedAt: '2026-10-23T14:40:00.000Z',
    contentHash: 'abc',
    cupsCode: '232102',
    cost: 180000,
    catalogServices: [
      { id: 's1', procedure: 'Obturación', cupsCode: '232102', requiereCupsRips: true, cost: 180000 },
      { id: 's2', procedure: 'Control', cupsCode: '890303', requiereCupsRips: true, cost: 0 },
    ],
    ripsMetadata: {
      ...createDefaultEvolutionNoteRipsMetadata(),
      codDiagnosticoPrincipal: 'K02.1',
      tipoVinculacionFinanciera: 'fev',
      idFacturaElectronica: 'fev-4',
      finalidadTecnologia: '11',
      causaMotivoAtencion: '38',
    },
    numeroSoportePago: 'FV0001',
    ...extra,
  }
}

const base = { paciente, prestador, numeroSoporte: 'FV0001' }

test('rechaza el envío si la nota no está firmada, sin CIE-10, sin CUPS o sin pago', () => {
  assert.throws(
    () => validarEnvioRipsNota({ ...base, note: notaFirmada({ isLocked: false, signedAt: null, contentHash: null }) }),
    (error) => error instanceof EvolutionRipsPayloadError && error.field === 'firma',
  )
  assert.throws(
    () =>
      validarEnvioRipsNota({
        ...base,
        note: notaFirmada({
          ripsMetadata: { ...notaFirmada().ripsMetadata, codDiagnosticoPrincipal: '' },
        }),
      }),
    (error) => error instanceof EvolutionRipsPayloadError && error.field === 'codDiagnosticoPrincipal',
  )
  assert.throws(
    () =>
      validarEnvioRipsNota({
        ...base,
        note: notaFirmada({ cupsCode: null, procedure: 'sin código', catalogServices: [] }),
      }),
    (error) => error instanceof EvolutionRipsPayloadError && error.field === 'cupsCode',
  )
  assert.throws(
    () =>
      validarEnvioRipsNota({
        ...base,
        note: notaFirmada({
          ripsMetadata: {
            ...notaFirmada().ripsMetadata,
            tipoVinculacionFinanciera: 'recibo_interno',
            idFacturaElectronica: null,
            idReciboAsociado: null,
          },
        }),
      }),
    (error) => error instanceof EvolutionRipsPayloadError && error.field === 'idReciboAsociado',
  )
})

test('arma usuarios, consultas y procedimientos con REPS, CIE-10, causa 38 y finalidad 11', () => {
  const rips = armarRipsNotaEvolucion({ ...base, note: notaFirmada() })
  const usuario = rips.usuarios[0]
  const consulta = usuario.servicios.consultas[0]
  const procedimiento = usuario.servicios.procedimientos[0]

  assert.equal(rips.numDocumentoIdObligado, '900123456')
  assert.equal(rips.numFactura, 'FV0001')
  assert.equal(usuario.tipoDocumentoIdentificacion, 'CC')
  assert.equal(usuario.numDocumentoIdentificacion, '52987654')
  assert.equal(usuario.fechaNacimiento, '1992-03-14')
  assert.equal(consulta.codPrestador, '680010389801')
  assert.equal(consulta.codConsulta, '890303')
  assert.equal(consulta.codDiagnosticoPrincipal, 'K021')
  assert.equal(consulta.causaMotivoAtencion, '38')
  assert.equal(consulta.finalidadTecnologiaSalud, '11')
  assert.equal(consulta.fechaInicioAtencion, '2026-10-23 09:30')
  assert.equal(procedimiento.codProcedimiento, '232102')
  assert.equal(procedimiento.finalidadTecnologiaSalud, '11')
  assert.equal(procedimiento.vrServicio, 180000)
  assert.equal(procedimiento.numFEVPagoModerador, null)
  assert.equal(consulta.vrServicio, 0)
})

test('la atención en $0 deja la tarifa en cero y no exige soporte', () => {
  const rips = armarRipsNotaEvolucion({
    ...base,
    numeroSoporte: null,
    note: notaFirmada({
      cost: 0,
      numeroSoportePago: null,
      ripsMetadata: {
        ...notaFirmada().ripsMetadata,
        tipoVinculacionFinanciera: 'valor_cero',
        idFacturaElectronica: null,
        idReciboAsociado: null,
        conceptoRecaudo: '05',
      },
    }),
  })
  assert.equal(rips.numFactura, null)
  assert.equal(rips.usuarios[0].servicios.procedimientos[0].vrServicio, 0)
  assert.equal(rips.usuarios[0].servicios.consultas[0].conceptoRecaudo, '05')
})

test('el nombre del catálogo legacy cap. 39 cuenta como CUPS 391402 aunque la nota no guardó el código', () => {
  const procedure = 'Ortodoncia correctiva con aparatos fijos (legacy cap. 39)'
  const rips = armarRipsNotaEvolucion({
    ...base,
    numeroSoporte: 'FV00000008',
    note: notaFirmada({
      cupsCode: null,
      procedure,
      serviceName: procedure,
      cost: 80000,
      catalogServices: [
        {
          id: 's-orto',
          procedure,
          serviceName: procedure,
          cupsCode: null,
          requiereCupsRips: true,
          cost: 80000,
        },
      ],
      ripsMetadata: {
        ...notaFirmada().ripsMetadata,
        tipoVinculacionFinanciera: 'recibo_interno',
        idFacturaElectronica: null,
        idReciboAsociado: 'pago-8',
      },
    }),
  })
  const procedimientos = rips.usuarios[0].servicios.procedimientos
  assert.equal(procedimientos.length, 1)
  assert.equal(procedimientos[0].codProcedimiento, '391402')
  assert.equal(procedimientos[0].vrServicio, 80000)
  assert.equal(rips.usuarios[0].servicios.consultas.length, 0)
})

test('un código punteado junto a «cap. 39» no se convierte en los últimos seis dígitos', () => {
  const procedure = '39.1.4.02 — Ortodoncia correctiva con aparatos fijos (legacy cap. 39)'
  const rips = armarRipsNotaEvolucion({
    ...base,
    note: notaFirmada({
      cupsCode: null,
      procedure,
      catalogServices: [],
    }),
  })
  assert.equal(rips.usuarios[0].servicios.procedimientos[0].codProcedimiento, '391402')
})

test('el recibo interno queda en el soporte de la línea y numFactura sigue vacío', () => {
  const rips = armarRipsNotaEvolucion({
    ...base,
    numeroSoporte: 'RC-12',
    note: notaFirmada({
      numeroSoportePago: 'RC-12',
      ripsMetadata: {
        ...notaFirmada().ripsMetadata,
        tipoVinculacionFinanciera: 'recibo_interno',
        idFacturaElectronica: null,
        idReciboAsociado: 'pago-12',
      },
    }),
  })
  assert.equal(rips.numFactura, null)
  assert.equal(rips.usuarios[0].servicios.procedimientos[0].numFEVPagoModerador, 'RC-12')
})
