/**
 * Contrato del envío RS a SISPRO, sin red y sin pacientes de ejemplo.
 */
import assert from 'node:assert/strict'
import { hasBlockingValidationErrors, validateRipsPackageLocally } from '../server/services/ripsLocalValidator.js'
import {
  FEVRIPS_PATHS,
  buildFevRipsRequestBody,
  buildLoginSisproBody,
  classifyMinistryResponse,
  prepararRipsSinFactura,
  resolveCredenciales,
} from '../server/services/fevRipsProtocol.js'
import { ejecutarEnvioRealMinisterio } from '../server/jobs/ejecutarEnvioRealMinisterio.js'

const paquete = {
  numDocumentoIdObligado: '900555111',
  numFactura: null,
  tipoNota: null,
  numNota: null,
  usuarios: [
    {
      tipoDocumentoIdentificacion: 'CC',
      numDocumentoIdentificacion: '1234567890',
      tipoUsuario: '01',
      fechaNacimiento: '1990-04-12',
      codSexo: 'F',
      codPaisResidencia: '170',
      codMunicipioResidencia: '11001',
      codZonaTerritorialResidencia: '02',
      incapacidad: 'NO',
      consecutivo: 1,
      codPaisOrigen: '170',
      servicios: {
        consultas: [
          {
            codPrestador: '192030405001',
            fechaInicioAtencion: '2024-06-01 08:30',
            numAutorizacion: null,
            codConsulta: '890203',
            modalidadGrupoServicioTecnologia: '01',
            grupoServicios: '01',
            codServicio: 328,
            finalidadTecnologiaSalud: '11',
            causaMotivoAtencion: '38',
            codDiagnosticoPrincipal: 'K020',
            tipoDiagnosticoPrincipal: '01',
            tipoDocumentoIdentificacion: 'CC',
            numDocumentoIdentificacion: '79605611',
            vrServicio: 0,
            conceptoRecaudo: '05',
            valorPagoModerador: 0,
            numFEVPagoModerador: null,
            consecutivo: 1,
          },
        ],
      },
    },
    {
      tipoDocumentoIdentificacion: 'CC',
      numDocumentoIdentificacion: '1020304050',
      tipoUsuario: '01',
      fechaNacimiento: '1985-01-02',
      codSexo: 'M',
      codPaisResidencia: '170',
      codMunicipioResidencia: '05001',
      codZonaTerritorialResidencia: '02',
      incapacidad: 'NO',
      consecutivo: 2,
      codPaisOrigen: '170',
      servicios: {
        consultas: [
          {
            codPrestador: '192030405001',
            fechaInicioAtencion: '2024-06-02 09:00',
            codConsulta: '890203',
            modalidadGrupoServicioTecSal: '01',
            grupoServicios: '01',
            codServicio: 328,
            finalidadTecnologiaSalud: '11',
            causaMotivoAtencion: '38',
            codDiagnosticoPrincipal: 'K021',
            tipoDiagnosticoPrincipal: '01',
            tipoDocumentoIdentificacion: 'CC',
            numDocumentoIdentificacion: '79605611',
            vrServicio: 0,
            conceptoRecaudo: '05',
            valorPagoModerador: 0,
            consecutivo: 1,
          },
        ],
      },
    },
  ],
}

const conGuion = prepararRipsSinFactura(
  { ...paquete, tipoNota: 'RS', numNota: 'NOTA-REAL-1' },
)
assert.equal(conGuion.numFactura, null)
assert.equal(conGuion.tipoNota, 'RS')
assert.match(conGuion.numNota, /^RS\d+$/)
assert.equal(conGuion.numNota.includes('-'), false)

const conservada = prepararRipsSinFactura({ ...paquete, tipoNota: 'RS', numNota: 'RS12345' })
assert.equal(conservada.numNota, 'RS12345')

const built = buildFevRipsRequestBody(paquete, '<AttachedDocument/>')
assert.equal(built.operacion.path, FEVRIPS_PATHS.cargarRipsSinFactura)
assert.equal(built.operacion.sinFactura, true)
assert.equal(built.body.xmlFevFile, '')
assert.equal(built.body.rips.usuarios.length, 2)
assert.equal(built.body.rips.usuarios[0].servicios.consultas[0].modalidadGrupoServicioTecSal, '01')
assert.equal(built.body.rips.usuarios[0].servicios.consultas[0].modalidadGrupoServicioTecnologia, undefined)

const fevSinXml = buildFevRipsRequestBody(
  { ...paquete, numFactura: 'FV123', tipoNota: null, numNota: null },
  undefined,
)
assert.match(fevSinXml.error, /xmlFev/)

const fev = buildFevRipsRequestBody(
  { ...paquete, numFactura: 'FV123', tipoNota: null, numNota: null },
  '<Invoice/>',
)
assert.equal(fev.operacion.path, FEVRIPS_PATHS.cargarFevRips)
assert.equal(fev.body.xmlFevFile, Buffer.from('<Invoice/>', 'utf8').toString('base64'))

const loginNit = buildLoginSisproBody(
  resolveCredenciales({
    tipoUsuario: 'NIT',
    numeroDocumento: '900555111',
    nitObligado: '900555111',
    clave: 'secreto',
  }),
)
assert.equal(loginNit.persona.identificacion.tipo, 'NIT')
assert.equal(loginNit.persona.identificacion.numero, '900555111')
assert.equal(loginNit.nit, '900555111')
assert.equal(Object.hasOwn(loginNit, 'tipoUsuario'), false)

const loginRe = buildLoginSisproBody(
  resolveCredenciales({
    tipoUsuario: 'RE',
    numeroDocumento: '79605611',
    nitObligado: '900555111',
    clave: 'secreto',
  }),
)
assert.equal(loginRe.tipoUsuario, 'RE')
assert.equal(loginRe.persona.identificacion.tipo, 'CC')

const aprobado = classifyMinistryResponse({
  ResultState: true,
  ProcesoId: 13,
  CodigoUnicoValidacion: 'abc123',
  Modulo: 'RipsSinFactura',
  ResultadosValidacion: [{ Clase: 'NOTIFICACION', Codigo: 'RVC059', Descripcion: 'aviso' }],
})
assert.equal(aprobado.approved, true)
assert.equal(aprobado.cuv, 'abc123')
assert.equal(aprobado.notificaciones.length, 1)
assert.equal(aprobado.ministryErrors.length, 0)

const rechazado = classifyMinistryResponse({
  ResultState: false,
  CodigoUnicoValidacion: 'No aplica a paquetes procesados en estado [RECHAZADO]',
  ResultadosValidacion: [{ Clase: 'RECHAZADO', Descripcion: 'documento inválido', Codigo: 'RVC001' }],
})
assert.equal(rechazado.approved, false)
assert.equal(rechazado.cuv, null)
assert.match(rechazado.ministryErrors[0].message, /documento inválido/)

const issues = validateRipsPackageLocally(built.body.rips, {
  allowNullNumFactura: true,
  esRipsTemporal: true,
  perfilFiscal: 'No_Obligado',
  fechaGeneracion: new Date('2026-09-29T12:00:00'),
})
assert.equal(hasBlockingValidationErrors(issues), false, JSON.stringify(issues, null, 2))

const job = await ejecutarEnvioRealMinisterio()
assert.equal(job.success, false)
assert.match(job.error, /MINSALUD_SANDBOX|credenciales SISPRO/)

console.log('test-ministerio-rips: ok')
