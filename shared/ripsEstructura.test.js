import assert from 'node:assert/strict'
import test from 'node:test'
import { completarRipsSinFactura, incapacidadMuv, normalizarEstructuraRips } from './ripsEstructura.js'

test('la incapacidad del MUV es SI o NO', () => {
  assert.equal(incapacidadMuv('02'), 'NO')
  assert.equal(incapacidadMuv('01'), 'SI')
  assert.equal(incapacidadMuv('NO'), 'NO')
  assert.equal(incapacidadMuv('SI'), 'SI')
})

test('un procedimiento de TI sin consultas no envía arreglos vacíos ni CIE-11 ausente', () => {
  const rips = normalizarEstructuraRips({
    numDocumentoIdObligado: '1234567890',
    numFactura: null,
    tipoNota: null,
    numNota: null,
    usuarios: [
      {
        tipoDocumentoIdentificacion: 'TI',
        numDocumentoIdentificacion: '1097106893',
        tipoUsuario: '04',
        fechaNacimiento: '2009-12-03',
        codSexo: 'M',
        codPaisResidencia: '170',
        codMunicipioResidencia: '68001',
        codZonaTerritorialResidencia: '01',
        incapacidad: '02',
        consecutivo: 1,
        codPaisOrigen: '170',
        servicios: {
          consultas: [],
          procedimientos: [
            {
              codPrestador: '680010389801',
              fechaInicioAtencion: '2026-10-24 16:04',
              idMIPRES: null,
              numAutorizacion: null,
              codProcedimiento: '391402',
              viaIngresoServicioSalud: '01',
              modalidadGrupoServicioTecSal: '01',
              grupoServicios: '04',
              codServicio: 344,
              finalidadTecnologiaSalud: '11',
              tipoDocumentoIdentificacion: 'CC',
              numDocumentoIdentificacion: '1234567890',
              codDiagnosticoPrincipal: 'K074',
              codDiagnosticoPrincipalCIE11: '',
              nomCodDiagnosticoPrincipalCIE11: '',
              codDiagnosticoRelacionado: null,
              codComplicacion: null,
              codComplicacionCIE11: '',
              nomComplicacionCIE11: '',
              vrServicio: 1000000,
              conceptoRecaudo: '05',
              valorPagoModerador: 0,
              numFEVPagoModerador: null,
              consecutivo: 1,
              codigoVIDA: null,
              piezaDental: 11,
            },
          ],
          urgencias: [],
          hospitalizacion: [],
          recienNacidos: [],
          medicamentos: [],
          otrosServicios: [],
        },
      },
    ],
  })

  const usuario = rips.usuarios[0]
  const procedimiento = usuario.servicios.procedimientos[0]
  assert.equal(usuario.tipoDocumentoIdentificacion, 'TI')
  assert.equal(usuario.incapacidad, 'NO')
  assert.equal(usuario.servicios.consultas, null)
  assert.equal(usuario.servicios.urgencias, null)
  assert.equal(usuario.servicios.hospitalizacion, null)
  assert.equal(usuario.servicios.recienNacidos, null)
  assert.equal(usuario.servicios.medicamentos, null)
  assert.equal(usuario.servicios.otrosServicios, null)
  assert.equal(procedimiento.codProcedimiento, '391402')
  assert.equal(procedimiento.modalidadGrupoServicioTecSal, '01')
  assert.equal(procedimiento.codDiagnosticoRelacionadoCIE11, '')
  assert.equal(procedimiento.nomCodDiagnosticoPrincipalCIE11, undefined)
  assert.equal(procedimiento.nomCodDiagnosticoRelacionadoCIE11, undefined)
  assert.equal(procedimiento.nomComplicacionCIE11, undefined)
  assert.equal(procedimiento.codigoVIDA, '')
  assert.equal(procedimiento.piezaDental, undefined)
  assert.equal(procedimiento.tipoDocumentoIdentificacion, 'CC')
})

test('el RIPS sin factura lleva tipoNota RS y numNota', () => {
  const rips = completarRipsSinFactura({ numFactura: null, tipoNota: null, numNota: null, usuarios: [] })
  assert.equal(rips.numFactura, null)
  assert.equal(rips.tipoNota, 'RS')
  assert.match(rips.numNota, /^NOTA-\d+$/)
  const conFactura = completarRipsSinFactura({ numFactura: 'FV-1', tipoNota: 'NC', numNota: 'NC1' })
  assert.equal(conFactura.numFactura, null)
  assert.equal(conFactura.tipoNota, 'NC')
  assert.equal(conFactura.numNota, 'NC1')
})
