import assert from 'node:assert/strict'
import test from 'node:test'
import { validateRipsStructureSyntax } from '../../shared/ripsStructureValidation.js'
import {
  FLUJO_RIPS_CON_FEV,
  FLUJO_RIPS_SIN_FEV_CERO,
  FLUJO_RIPS_SIN_FEV_RECIBO,
  isNumeroFevOficial,
  isNumeroReciboCaja,
  resolveRipsCobroFlujo,
  validateNumFacturaDelFlujo,
} from '../../shared/ripsCobroFlow.js'
import { numeroFevDelProveedor } from './fevNumeroProveedor.js'

function ripsBase(extra = {}) {
  return {
    numDocumentoIdObligado: '900123456',
    numFactura: null,
    tipoNota: null,
    numNota: null,
    usuarios: [
      {
        tipoDocumentoIdentificacion: 'CC',
        numDocumentoIdentificacion: '1020708099',
        tipoUsuario: '04',
        fechaNacimiento: '1991-06-25',
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
              codPrestador: '680010389801',
              fechaInicioAtencion: '2026-10-07 09:30',
              numAutorizacion: null,
              codConsulta: '890203',
              modalidadGrupoServicioTecSal: '01',
              grupoServicios: '01',
              codServicio: 334,
              finalidadTecnologiaSalud: '11',
              causaMotivoAtencion: '38',
              codDiagnosticoPrincipal: 'K021',
              tipoDiagnosticoPrincipal: '01',
              tipoDocumentoIdentificacion: 'CC',
              numDocumentoIdentificacion: '79904620',
              vrServicio: 45000,
              conceptoRecaudo: '05',
              valorPagoModerador: 0,
              numFEVPagoModerador: null,
              consecutivo: 1,
            },
          ],
        },
      },
    ],
    ...extra,
  }
}

test('FEV exige el número del proveedor y el CUFE', () => {
  assert.equal(
    resolveRipsCobroFlujo({ perfilFiscal: 'Obligado_FEV', valorAtencion: 45000 }),
    FLUJO_RIPS_CON_FEV,
  )
  const sinCufe = validateNumFacturaDelFlujo({
    flujo: FLUJO_RIPS_CON_FEV,
    numFactura: 'FE-00012',
    fevReferencia: 'FE-00012',
  })
  assert.equal(sinCufe.valid, false)
  assert.match(sinCufe.message, /CUFE/)

  const cruce = validateNumFacturaDelFlujo({
    flujo: FLUJO_RIPS_CON_FEV,
    numFactura: 'FE-00012',
    cufe: 'A'.repeat(96),
    fevReferencia: 'FE-00099',
  })
  assert.equal(cruce.valid, false)
  assert.match(cruce.message, /1:1/)

  const ok = validateRipsStructureSyntax(
    ripsBase({ numFactura: 'FE-00012', cufe: 'A'.repeat(96) }),
    {
      perfilFiscal: 'Obligado_FEV',
      valorAtencion: 45000,
      cufe: 'A'.repeat(96),
      fevReferencia: 'FE-00012',
      codPrestador: '680010389801',
    },
  )
  assert.equal(ok.some((issue) => issue.field === 'numFactura'), false)
})

test('el no obligado con cobro usa RC- y rechaza CUFE', () => {
  assert.equal(isNumeroReciboCaja('RC-00001'), true)
  assert.equal(isNumeroFevOficial('RC-00001'), false)
  assert.equal(
    resolveRipsCobroFlujo({ perfilFiscal: 'No_Obligado', valorAtencion: 45000 }),
    FLUJO_RIPS_SIN_FEV_RECIBO,
  )
  const conCufe = validateNumFacturaDelFlujo({
    flujo: FLUJO_RIPS_SIN_FEV_RECIBO,
    numFactura: 'RC-00007',
    cufe: 'ABC',
  })
  assert.equal(conCufe.valid, false)

  const issues = validateRipsStructureSyntax(ripsBase({ numFactura: 'RC-00007' }), {
    perfilFiscal: 'No_Obligado',
    valorAtencion: 45000,
    codPrestador: '680010389801',
  })
  assert.equal(issues.some((issue) => issue.field === 'numFactura'), false)

  const sinRecibo = validateRipsStructureSyntax(ripsBase({ numFactura: null }), {
    perfilFiscal: 'No_Obligado',
    valorAtencion: 45000,
    codPrestador: '680010389801',
  })
  assert.equal(sinRecibo.some((issue) => issue.field === 'numFactura'), true)
})

test('la atención a $0 permite numFactura null y vrServicio 0', () => {
  assert.equal(
    resolveRipsCobroFlujo({ perfilFiscal: 'Obligado_FEV', valorAtencion: 0 }),
    FLUJO_RIPS_SIN_FEV_CERO,
  )
  const paquete = ripsBase({ numFactura: null })
  paquete.usuarios[0].servicios.consultas[0].vrServicio = 0
  const issues = validateRipsStructureSyntax(paquete, {
    perfilFiscal: 'No_Obligado',
    atencionCero: true,
    valorAtencion: 0,
    codPrestador: '680010389801',
  })
  assert.equal(issues.some((issue) => issue.field === 'numFactura'), false)

  const conDocumento = validateNumFacturaDelFlujo({
    flujo: FLUJO_RIPS_SIN_FEV_CERO,
    numFactura: 'RC-00001',
  })
  assert.equal(conDocumento.valid, false)
})

test('el proveedor asigna FE- sin usar la secuencia RC-', () => {
  const claveA = 'tenant-a-12345678'
  const claveB = 'tenant-b-12345678'
  assert.equal(numeroFevDelProveedor(claveA), 'FE-00001')
  assert.equal(numeroFevDelProveedor(claveB), 'FE-00001')
  assert.equal(numeroFevDelProveedor(claveA, 'RC-00004'), 'FE-00002')
  assert.equal(numeroFevDelProveedor(claveA, 'FE-00002'), 'FE-00002')
})
