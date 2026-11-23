import assert from 'node:assert/strict'
import test from 'node:test'
import {
  completarRipsSinFactura,
  incapacidadMuv,
  normalizarEstructuraRips,
  prepararRipsParaSalida,
  sanitizarNumNotaLegado,
} from './ripsEstructura.js'

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
  assert.match(rips.numNota, /^RS\d+$/)
  assert.match(rips.numNota, /^[A-Za-z][A-Za-z0-9]{0,3}\d{1,20}$/)
  const conFactura = completarRipsSinFactura({ numFactura: 'FV-1', tipoNota: 'NC', numNota: 'NC1' })
  assert.equal(conFactura.numFactura, null)
  assert.equal(conFactura.tipoNota, 'NC')
  assert.equal(conFactura.numNota, 'NC1')
})

test('sanitizarNumNotaLegado reescribe NOTA-… a RS+dígitos', () => {
  const fixed = sanitizarNumNotaLegado({
    tipoNota: 'RS',
    numNota: 'NOTA-1795395067449',
    usuarios: [],
  })
  assert.equal(fixed.numNota, 'RS1795395067449')
  const intacto = sanitizarNumNotaLegado({ tipoNota: 'RS', numNota: 'RS1795395067449', usuarios: [] })
  assert.equal(intacto.numNota, 'RS1795395067449')
  const nc = sanitizarNumNotaLegado({ tipoNota: 'NC', numNota: 'NOTA-1', usuarios: [] })
  assert.equal(nc.numNota, 'NOTA-1')
})

test('prepararRipsParaSalida corrige numNota legado y mantiene CIE11/codigoVIDA en string vacío', () => {
  const rips = prepararRipsParaSalida(
    {
      numDocumentoIdObligado: '79904620',
      numFactura: null,
      tipoNota: 'RS',
      numNota: 'NOTA-1795395067449',
      usuarios: [
        {
          tipoDocumentoIdentificacion: 'CC',
          numDocumentoIdentificacion: '37861325',
          incapacidad: '02',
          servicios: {
            consultas: [],
            procedimientos: [
              {
                codProcedimiento: '230103',
                codDiagnosticoPrincipal: 'K020',
                codDiagnosticoPrincipalCIE11: '',
                codDiagnosticoRelacionadoCIE11: '',
                codComplicacionCIE11: '',
                codigoVIDA: '',
                campoOpcionalVacio: '',
              },
            ],
            medicamentos: [],
            otrosServicios: [],
            urgencias: [],
            hospitalizacion: [],
            recienNacidos: [],
          },
        },
      ],
    },
    { sinFactura: true },
  )
  assert.equal(rips.numNota, 'RS1795395067449')
  assert.equal(rips.tipoNota, 'RS')
  assert.equal(rips.numFactura, null)
  const proc = rips.usuarios[0].servicios.procedimientos[0]
  assert.equal(proc.codDiagnosticoPrincipalCIE11, '')
  assert.equal(proc.codDiagnosticoRelacionadoCIE11, '')
  assert.equal(proc.codComplicacionCIE11, '')
  assert.equal(proc.codigoVIDA, '')
  assert.equal(proc.campoOpcionalVacio, null)
  assert.equal(rips.usuarios[0].incapacidad, 'NO')
  assert.equal(rips.usuarios[0].servicios.consultas, null)
})
