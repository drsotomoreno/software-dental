import assert from 'node:assert/strict'
import test from 'node:test'
import {
  applySinFacturaBillingContract,
  resolveAndValidateCanonicalEvolutionRips,
  resolveCanonicalCupsCodes,
  resolveCanonicalEvolutionRips,
  validateCanonicalEvolutionRips,
} from './canonicalEvolutionRips.js'

const patientOk = {
  documentType: 'CC',
  documentNumber: '37861325',
  birthDate: '1975-04-12',
  gender: 'F',
  municipalityCode: '68001',
  regime: 'particular',
}

const clinicOk = {
  documentType: 'CC',
  documentNumber: '91234567',
  providerNit: '900123456',
  repsCode: '6800103898-01',
}

function noteBase(extra = {}) {
  return {
    id: 'evo-1',
    date: '2026-11-21T10:15',
    procedure: 'Exodoncia',
    clinicalNote: 'Procedimiento realizado.',
    cupsCode: '230101',
    professionalLicense: '91234567',
    isLocked: true,
    signedAt: '2026-11-21T15:00:00.000Z',
    contentHash: 'abc123',
    cost: 150000,
    catalogServices: [
      {
        id: 's1',
        procedure: 'Exodoncia de dientes permanentes',
        cupsCode: '230101',
        cie10Code: 'K081',
        requiereCupsRips: true,
      },
    ],
    ripsMetadata: {
      codDiagnosticoPrincipal: 'K081',
      cupsCode: null,
      tipoVinculacionFinanciera: 'fev',
      idFacturaElectronica: 'fev-1',
      idReciboAsociado: null,
      ripsEstado: 'sin_preparar',
      finalidadTecnologia: '11',
      causaMotivoAtencion: '38',
      conceptoRecaudo: '05',
    },
    numeroSoportePago: 'FV0009',
    ...extra,
  }
}

test('resolveCanonicalEvolutionRips prioriza ripsMetadata.cupsCode > cupsCode > catálogo/texto', () => {
  const note = noteBase({
    cupsCode: '232102',
    procedure: '230101 — Exodoncia',
    catalogServices: [{ id: 's1', procedure: '230101', cupsCode: '230101', requiereCupsRips: true }],
    ripsMetadata: { ...noteBase().ripsMetadata, cupsCode: '890203' },
  })
  assert.deepEqual(resolveCanonicalCupsCodes(note), ['890203', '232102', '230101'])
  assert.equal(resolveCanonicalEvolutionRips(note, patientOk, clinicOk).primaryCups, '890203')
})

test('paciente incompleto falla firma y envío con errores estructurados', () => {
  const note = noteBase()
  const incomplete = { documentType: 'CC', documentNumber: '' }
  const { validation: sign } = resolveAndValidateCanonicalEvolutionRips(
    note,
    incomplete,
    clinicOk,
    'sign',
  )
  assert.equal(sign.valid, false)
  assert.ok(sign.errors.some((e) => e.code === 'PATIENT_DOC_NUMBER'))
  assert.ok(sign.errors.some((e) => e.code === 'PATIENT_BIRTHDATE'))
  assert.ok(sign.errors.some((e) => e.code === 'PATIENT_GENDER'))
  assert.ok(sign.errors.some((e) => e.code === 'PATIENT_MUNICIPALITY'))
  assert.ok(sign.errors.every((e) => e.field && e.message))

  const { validation: send } = resolveAndValidateCanonicalEvolutionRips(
    note,
    incomplete,
    clinicOk,
    'send',
  )
  assert.equal(send.valid, false)
  assert.ok(send.errors.some((e) => e.scope === 'patient'))
})

test('nota sin CIE-10 falla validación canónica', () => {
  const note = noteBase({
    catalogServices: [{ id: 's1', procedure: 'Exodoncia', cupsCode: '230101', requiereCupsRips: true }],
    ripsMetadata: { ...noteBase().ripsMetadata, codDiagnosticoPrincipal: '' },
  })
  const resolved = resolveCanonicalEvolutionRips(note, patientOk, clinicOk)
  assert.equal(resolved.cie10Principal, '')
  const validation = validateCanonicalEvolutionRips(resolved, 'sign')
  assert.equal(validation.valid, false)
  assert.ok(validation.errors.some((e) => e.code === 'CIE10_REQUIRED' && e.field === 'codDiagnosticoPrincipal'))
})

test('nota con CUPS solo en catálogo / texto resuelve primaryCups', () => {
  const note = noteBase({
    cupsCode: null,
    procedure: '230101 — Exodoncia de dientes permanentes',
    catalogServices: [
      {
        id: 's1',
        procedure: '230101 — Exodoncia de dientes permanentes',
        cupsCode: null,
        cie10Code: 'K081',
        requiereCupsRips: true,
      },
    ],
    ripsMetadata: { ...noteBase().ripsMetadata, cupsCode: null },
  })
  const resolved = resolveCanonicalEvolutionRips(note, patientOk, clinicOk)
  assert.equal(resolved.primaryCups, '230101')
  const validation = validateCanonicalEvolutionRips(resolved, 'sign')
  assert.equal(validation.valid, true)
})

test('envío FEV exige numFactura / idFacturaElectronica', () => {
  const note = noteBase({
    numeroSoportePago: null,
    ripsMetadata: {
      ...noteBase().ripsMetadata,
      tipoVinculacionFinanciera: 'fev',
      idFacturaElectronica: null,
    },
  })
  const { validation } = resolveAndValidateCanonicalEvolutionRips(note, patientOk, clinicOk, 'send')
  assert.equal(validation.valid, false)
  assert.ok(validation.errors.some((e) => e.code === 'FEV_NUM_FACTURA'))
})

test('envío sin factura (recibo) exige idReciboAsociado y applySinFactura fija RVG06', () => {
  const note = noteBase({
    ripsMetadata: {
      ...noteBase().ripsMetadata,
      tipoVinculacionFinanciera: 'recibo_interno',
      idFacturaElectronica: null,
      idReciboAsociado: null,
    },
  })
  const { validation } = resolveAndValidateCanonicalEvolutionRips(note, patientOk, clinicOk, 'send')
  assert.equal(validation.valid, false)
  assert.ok(validation.errors.some((e) => e.code === 'RECIBO_REQUIRED'))

  const ok = noteBase({
    ripsMetadata: {
      ...noteBase().ripsMetadata,
      tipoVinculacionFinanciera: 'recibo_interno',
      idFacturaElectronica: null,
      idReciboAsociado: 'pago-9',
    },
  })
  const { validation: okVal, resolved } = resolveAndValidateCanonicalEvolutionRips(
    ok,
    patientOk,
    clinicOk,
    'send',
  )
  assert.equal(okVal.valid, true)
  assert.equal(resolved.billingMode, 'sin_factura')

  const contract = applySinFacturaBillingContract(
    { numFactura: 'FV1', tipoNota: null, numNota: null, usuarios: [] },
    'seed-1',
  )
  assert.equal(contract.numFactura, null)
  assert.equal(contract.tipoNota, 'RS')
  assert.equal(contract.numNota, 'NOTA-seed-1')
})

test('atención valor_cero no exige recibo ni FEV', () => {
  const note = noteBase({
    cost: 0,
    numeroSoportePago: null,
    ripsMetadata: {
      ...noteBase().ripsMetadata,
      tipoVinculacionFinanciera: 'valor_cero',
      idFacturaElectronica: null,
      idReciboAsociado: null,
    },
  })
  const { validation, resolved } = resolveAndValidateCanonicalEvolutionRips(
    note,
    patientOk,
    clinicOk,
    'send',
  )
  assert.equal(resolved.billingMode, 'valor_cero')
  assert.equal(validation.valid, true)
})

test('servicios non_rips omiten CUPS/CIE-10', () => {
  const note = noteBase({
    requiereCupsRips: false,
    cupsCode: null,
    catalogServices: [
      {
        id: 's1',
        procedure: 'Tatuaje dental',
        serviceName: 'Tatuaje dental',
        cupsCode: null,
        requiereCupsRips: false,
      },
    ],
    ripsMetadata: { ...noteBase().ripsMetadata, codDiagnosticoPrincipal: '' },
  })
  const { validation, resolved } = resolveAndValidateCanonicalEvolutionRips(
    note,
    {},
    clinicOk,
    'send',
  )
  assert.equal(resolved.requiresRips, false)
  assert.equal(resolved.billingMode, 'non_rips')
  assert.equal(validation.valid, true)
})
