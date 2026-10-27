import assert from 'node:assert/strict'
import test from 'node:test'
import { dispositionForRipsClose, isRipsBatchCandidate } from '../types/ripsQueue.ts'
import {
  buildPreliminaryRipsJson,
  highlightFieldsForRipsIssues,
  validateRipsLocalSchema,
} from './ripsValidator.ts'

function nota(extra = {}) {
  return {
    id: 'evo-1',
    date: '2026-10-24T09:30',
    procedure: 'Obturación',
    anesthesia: { type: '', carpules: 0, vasoconstrictor: '' },
    prescriptions: '',
    professionalName: 'María González',
    professionalLicense: '1234567890',
    createdAt: '2026-10-24T14:30:00.000Z',
    cupsCode: '232102',
    cost: 80000,
    workflowStatus: 'DRAFT',
    ripsMetadata: {
      codDiagnosticoPrincipal: 'K021',
      causaMotivoAtencion: '38',
      finalidadTecnologia: '11',
      conceptoRecaudo: '05',
    },
    ...extra,
  }
}

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
  providerNit: '900123456-1',
  repsCode: '6800103898-01',
}

function cierre(extra = {}) {
  return {
    evolutionId: 'evo-1',
    patientId: '42',
    note: nota(),
    paciente,
    prestador,
    ...extra,
  }
}

test('un JSON preliminar completo pasa el esquema local', () => {
  const payload = buildPreliminaryRipsJson(cierre())
  const result = validateRipsLocalSchema(payload)
  assert.equal(result.valid, true, JSON.stringify(result.errors))
  assert.equal(payload.usuarios[0].numDocumentoIdentificacion, '52987654')
  assert.equal(payload.usuarios[0].tipoUsuario, '04')
  assert.equal(payload.usuarios[0].causaExterna, '38')
  assert.equal(payload.usuarios[0].servicios.procedimientos[0].codProcedimiento, '232102')
  assert.equal(payload.usuarios[0].servicios.procedimientos[0].codDiagnosticoPrincipal, 'K021')
  assert.equal(payload.numFactura, null)
})

test('acepta CUPS con puntos y diagnóstico solo CIE-11', () => {
  const payload = buildPreliminaryRipsJson(
    cierre({
      codDiagnosticoPrincipal: '',
      codDiagnosticoPrincipalCIE11: 'DA08.0',
      causaExterna: '21',
      note: nota({
        cupsCode: '23.2.1.02',
        ripsMetadata: { codDiagnosticoPrincipal: '', causaMotivoAtencion: '' },
      }),
    }),
  )
  const result = validateRipsLocalSchema(payload)
  assert.equal(result.valid, true, JSON.stringify(result.errors))
  assert.equal(payload.usuarios[0].servicios.procedimientos[0].codDiagnosticoPrincipalCIE11, 'DA08.0')
  assert.equal(payload.usuarios[0].servicios.procedimientos[0].codDiagnosticoPrincipal, '')
})

test('un borrador incompleto no se encola y señala los campos', () => {
  const payload = buildPreliminaryRipsJson(
    cierre({
      causaExterna: '',
      paciente: {
        documentType: '',
        documentNumber: '',
        birthDate: '',
        gender: 'O',
        regime: '',
      },
      note: nota({
        cupsCode: '123',
        procedure: 'Control',
        serviceName: '',
        catalogServices: [],
        ripsMetadata: { codDiagnosticoPrincipal: '', causaMotivoAtencion: '' },
      }),
    }),
  )
  const result = validateRipsLocalSchema(payload)
  assert.equal(result.valid, false)
  const fields = highlightFieldsForRipsIssues(result.errors)
  for (const field of ['documentType', 'documentNumber', 'birthDate', 'gender', 'tipoUsuario', 'cupsCode', 'codDiagnosticoPrincipal']) {
    assert.ok(fields.includes(field), field)
  }
  assert.ok(result.errors.some((error) => error.code === 'EXTERNAL_CAUSE' || error.code === 'CUPS'))
})

test('rechaza causa externa que no sea de dos dígitos y sexo fuera de catálogo', () => {
  const payload = buildPreliminaryRipsJson(cierre({ causaExterna: '8', paciente: { ...paciente, gender: 'O' } }))
  const result = validateRipsLocalSchema(payload)
  assert.equal(result.valid, false)
  assert.ok(result.errors.some((error) => error.code === 'SEX'))
  assert.ok(result.errors.some((error) => error.code === 'EXTERNAL_CAUSE'))
})

test('varios CUPS de la misma atención conservan su valor y la consulta no cae en procedimientos', () => {
  const payload = buildPreliminaryRipsJson(
    cierre({
      note: nota({
        cupsCode: '890201',
        cost: 280000,
        procedure: 'Consulta, resina y profilaxis',
        catalogServices: [
          { id: 'c', procedure: 'Consulta de primera vez', cupsCode: '890201', requiereCupsRips: true, cost: 50000 },
          { id: 'r', procedure: 'Restauración de resina', cupsCode: '232101', requiereCupsRips: true, cost: 150000 },
          { id: 'p', procedure: 'Profilaxis', cupsCode: '997103', requiereCupsRips: true, cost: 80000 },
        ],
      }),
    }),
  )
  const servicios = payload.usuarios[0].servicios
  assert.equal(servicios.consultas.length, 1)
  assert.equal(servicios.consultas[0].codConsulta, '890201')
  assert.equal(servicios.consultas[0].vrServicio, 50000)
  assert.deepEqual(
    servicios.procedimientos.map((item) => [item.codProcedimiento, item.vrServicio]),
    [
      ['232101', 150000],
      ['997103', 80000],
    ],
  )
  const suma =
    servicios.consultas[0].vrServicio +
    servicios.procedimientos.reduce((total, item) => total + item.vrServicio, 0)
  assert.equal(suma, 280000)
})

test('el flujo sin FEV queda en cola y el flujo con FEV no entra al lote', () => {
  const particular = dispositionForRipsClose(false)
  const fev = dispositionForRipsClose(true)
  assert.deepEqual(particular, { type: 'WITHOUT_FEV', status: 'QUEUED', nextStep: 'BATCH' })
  assert.equal(fev.type, 'WITH_FEV')
  assert.equal(fev.status, 'PROCESSING')
  assert.equal(fev.nextStep, 'EMIT_FEV')
  assert.equal(isRipsBatchCandidate(particular), true)
  assert.equal(isRipsBatchCandidate(fev), false)
})
