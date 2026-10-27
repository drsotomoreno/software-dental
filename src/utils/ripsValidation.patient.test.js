import assert from 'node:assert/strict'
import test from 'node:test'
import {
  formatRipsIssuePatientLabel,
  validateRipsExport,
} from './ripsValidation.ts'

function patient(partial) {
  return {
    id: partial.documentNumber,
    documentType: partial.documentType,
    documentNumber: partial.documentNumber,
    firstName: partial.firstName,
    lastName: partial.lastName,
    birthDate: '1990-01-01',
    gender: 'F',
    phone: '3000000000',
    municipalityCode: '11001',
    regime: 'particular',
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
  }
}

function source(person, treatmentPlan = []) {
  return {
    patient: person,
    record: {
      id: `hc-${person.documentNumber}`,
      patientId: person.id,
      isLocked: true,
      signedAt: '2026-10-24T15:00:00.000Z',
      diagnoses: [{ code: 'K021', description: 'Caries', type: 'principal', certainty: 'confirmado' }],
      budgetItems: [],
      treatmentPlan,
      evolutionNotes: [],
      paymentControlLines: [],
      createdAt: '2026-10-01T00:00:00.000Z',
      updatedAt: '2026-10-24T15:00:00.000Z',
    },
  }
}

const isabel = patient({
  documentType: 'CC',
  documentNumber: '37861325',
  firstName: 'isabel',
  lastName: 'De la Rosa',
})

const nicolas = patient({
  documentType: 'TI',
  documentNumber: '1097106893',
  firstName: 'nicolas andres',
  lastName: 'Álvarez bayona',
})

const professional = {
  id: 'pro-1',
  email: 'ortodoncista@example.com',
  firstName: 'Ana',
  lastName: 'Ortodoncista',
  documentType: 'CC',
  documentNumber: '1234567890',
  role: 'odontologo',
  clinicName: 'Clínica demo',
  providerNit: '900123456',
  repsCode: '110010389801',
  repsStatus: 'activo',
  thsSpecialty: 'ortodoncia',
  rehusSpecialty: 'ortodoncia',
  repsEnabledSpecialties: ['ortodoncia', 'odontologia_general'],
  perfilFiscal: 'No_Obligado',
}

function usuario(tipo, numero, codProcedimiento) {
  return {
    tipoDocumentoIdentificacion: tipo,
    numDocumentoIdentificacion: numero,
    tipoUsuario: '04',
    fechaNacimiento: '1990-01-01',
    codSexo: 'F',
    codPaisResidencia: '170',
    codMunicipioResidencia: '11001',
    codZonaTerritorialResidencia: '01',
    incapacidad: 'NO',
    consecutivo: 1,
    codPaisOrigen: '170',
    registroSIRAS: null,
    servicios: {
      consultas: [],
      procedimientos: [
        {
          codPrestador: '110010389801',
          fechaInicioAtencion: '2026-10-24 10:00',
          idMIPRES: null,
          numAutorizacion: null,
          codProcedimiento,
          viaIngresoServicioSalud: '01',
          modalidadGrupoServicioTecSal: '01',
          grupoServicios: '01',
          codServicio: 1,
          finalidadTecnologiaSalud: '11',
          tipoDocumentoIdentificacion: 'CC',
          numDocumentoIdentificacion: '1234567890',
          codDiagnosticoPrincipal: 'K021',
          codDiagnosticoPrincipalCIE11: '',
          nomCodDiagnosticoPrincipalCIE11: '',
          codDiagnosticoRelacionado: null,
          codComplicacion: null,
          codComplicacionCIE11: '',
          nomComplicacionCIE11: '',
          vrServicio: 0,
          conceptoRecaudo: '05',
          valorPagoModerador: 0,
          numFEVPagoModerador: null,
          consecutivo: 1,
          codigoVIDA: null,
        },
      ],
      urgencias: [],
      hospitalizacion: [],
      recienNacidos: [],
      medicamentos: [],
      otrosServicios: [],
    },
  }
}

test('los errores de especialidad indican el paciente y no se mezclan entre atenciones', () => {
  const issues = validateRipsExport(
    {
      numDocumentoIdObligado: '900123456',
      numFactura: null,
      tipoNota: null,
      numNota: null,
      usuarios: [
        usuario('CC', '37861325', '997403'),
        usuario('TI', '1097106893', '232102'),
      ],
    },
    [
      source(isabel, [{ id: 'plan-1', procedure: 'Control sin CUPS', toothNumber: 11 }]),
      source(nicolas),
    ],
    professional,
    {
      numDocumentoIdObligado: '900123456',
      numFactura: null,
      codPrestador: '110010389801',
      perfilFiscal: 'No_Obligado',
      esRipsTemporal: true,
      thsSpecialty: 'ortodoncia',
    },
  )

  const specialtyErrors = issues.filter(
    (issue) => issue.level === 'error' && (issue.field === 'cupsCode' || issue.field === 'repsEnabledSpecialties'),
  )
  assert.equal(specialtyErrors.length, 2)
  for (const issue of specialtyErrors) {
    assert.equal(issue.patientName, 'isabel De la Rosa')
    assert.equal(issue.patientDocument, 'CC 37861325')
    assert.equal(formatRipsIssuePatientLabel(issue), 'isabel De la Rosa (CC 37861325)')
    assert.equal(issue.patientName?.includes('nicolas'), false)
  }

  const warning = issues.find((issue) =>
    issue.message.includes('plan de tratamiento sin código CUPS'),
  )
  assert.ok(warning)
  assert.equal(warning.patientName, 'isabel De la Rosa')
  assert.equal(warning.patientDocument, 'CC 37861325')
  assert.equal(
    issues.some(
      (issue) =>
        (issue.field === 'cupsCode' || issue.field === 'repsEnabledSpecialties') &&
        issue.patientDocument === 'TI 1097106893',
    ),
    false,
  )
})

test('un hallazgo sin paciente no inventa un nombre', () => {
  assert.equal(formatRipsIssuePatientLabel({ message: 'NIT', level: 'error' }), null)
  assert.equal(
    formatRipsIssuePatientLabel({ message: 'doc', level: 'warning', patientDocument: 'CC 37861325' }),
    'CC 37861325',
  )
})
