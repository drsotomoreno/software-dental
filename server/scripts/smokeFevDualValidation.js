/**
 * Smoke del flujo dual CUFE → CUV.
 * Casos: DIAN rechazada, MUV con glosas, ambos OK.
 */
import { mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const dataDir = join(tmpdir(), `fev-dual-smoke-${Date.now()}`)
process.env.MINSALUD_SANDBOX = 'true'
await mkdir(dataDir, { recursive: true })

const { config } = await import('../config.js')
config.dataDir = dataDir
config.minsalud.sandbox = true

const { runFevDualValidation } = await import('../services/fevDualValidationService.js')
const { getFevTransactionByFactura } = await import('../services/cuvRepository.js')
const { ESTADO_DIAN, ESTADO_MINSALUD_MUV } = await import('../../shared/dualValidation.js')

const PRESTADOR = '680010389801'

function baseUsuario(overrides = {}) {
  return {
    tipoDocumentoIdentificacion: 'CC',
    numDocumentoIdentificacion: '1234567890',
    tipoUsuario: '04',
    fechaNacimiento: '1988-04-12',
    codSexo: 'M',
    codPaisResidencia: '170',
    codMunicipioResidencia: '11001',
    codZonaTerritorialResidencia: '01',
    incapacidad: 'NO',
    consecutivo: 1,
    codPaisOrigen: '170',
    registroSIRAS: null,
    ...overrides,
  }
}

function procedimiento({ cups = '890203', vrServicio = 80000 } = {}) {
  return {
    codPrestador: PRESTADOR,
    fechaInicioAtencion: '2026-03-15 09:30',
    numAutorizacion: null,
    codProcedimiento: cups,
    viaIngresoServicioSalud: '01',
    modalidadGrupoServicioTecSal: '01',
    grupoServicios: '01',
    codServicio: 328,
    finalidadTecnologiaSalud: '10',
    tipoDocumentoIdentificacion: 'CC',
    numDocumentoIdentificacion: '1234567890',
    codDiagnosticoPrincipal: 'K021',
    vrServicio,
    conceptoRecaudo: '05',
    valorPagoModerador: 0,
    numFEVPagoModerador: null,
    consecutivo: 1,
  }
}

function buildRips({ numFactura, usuario, cups, vrServicio }) {
  return {
    numDocumentoIdObligado: '900123456',
    numFactura,
    tipoNota: null,
    numNota: null,
    usuarios: [
      {
        ...baseUsuario(usuario),
        servicios: {
          consultas: [],
          procedimientos: [procedimiento({ cups, vrServicio })],
          urgencias: [],
          hospitalizacion: [],
          recienNacidos: [],
          medicamentos: [],
          otrosServicios: [],
        },
      },
    ],
  }
}

function invoiceFor(rips, payableAmount) {
  return {
    nitEmisor: rips.numDocumentoIdObligado,
    razonSocialEmisor: 'Clínica Dental Sonrisa',
    nitAdquiriente: '1234567890',
    razonSocialAdquiriente: 'Paciente Demo',
    issueDate: '2026-03-15',
    payableAmount,
    codPrestadorReps: '6800103898-01',
    lines: [
      {
        description: 'Consulta odontológica',
        quantity: 1,
        unitPrice: payableAmount,
        cupsCode: '890203',
      },
    ],
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

let failed = 0

async function runCase(name, fn) {
  try {
    await fn()
    console.log(`OK  ${name}`)
  } catch (error) {
    failed += 1
    console.error(`FAIL ${name}: ${error.message}`)
  }
}

await runCase('DIAN rechazada no llama MUV y no genera CUFE', async () => {
  const rips = buildRips({ numFactura: 'FV1001', usuario: {}, cups: '890203', vrServicio: 80000 })
  const result = await runFevDualValidation({
    rips,
    invoice: invoiceFor(rips, 80000),
    options: { forceDianReject: true },
  })
  assert(result.estado_dian === ESTADO_DIAN.RECHAZADO, `estado_dian=${result.estado_dian}`)
  assert(result.estado_minsalud_muv === ESTADO_MINSALUD_MUV.PENDIENTE_ENVIO, 'MUV debió quedar Pendiente_Envio')
  assert(!result.codigo_cufe, 'No debía haber CUFE')
  assert(!result.codigo_cuv, 'No debía haber CUV')
  assert(result.listoParaEntrega === false, 'No está lista para entrega')
  const stored = await getFevTransactionByFactura('FV1001')
  assert(stored?.estado_dian === ESTADO_DIAN.RECHAZADO, 'Registro servidor sin rechazo DIAN')
})

await runCase('CUFE OK + glosas MUV conserva CUFE', async () => {
  const rips = buildRips({
    numFactura: 'FV1002',
    usuario: { codSexo: 'F', fechaNacimiento: '2018-01-01' },
    cups: '862001',
    vrServicio: 50000,
  })
  const result = await runFevDualValidation({
    rips,
    invoice: invoiceFor(rips, 50000),
  })
  assert(result.estado_dian === ESTADO_DIAN.APROBADO, `estado_dian=${result.estado_dian}`)
  assert(Boolean(result.codigo_cufe), 'Faltó CUFE')
  assert(result.estado_minsalud_muv === ESTADO_MINSALUD_MUV.RECHAZADO_CON_GLOSAS, `MUV=${result.estado_minsalud_muv}`)
  assert(Array.isArray(result.detalles_rechazo_muv) && result.detalles_rechazo_muv.length > 0, 'Faltaron glosas')
  assert(!result.codigo_cuv, 'No debía haber CUV')
  assert(result.listoParaEntrega === false, 'No está lista para entrega')
  const stored = await getFevTransactionByFactura('FV1002')
  assert(stored?.codigo_cufe === result.codigo_cufe, 'El CUFE no se persistió')
})

await runCase('Ambos OK: CUFE + CUV y listoParaEntrega', async () => {
  const rips = buildRips({ numFactura: 'FV1003', usuario: {}, cups: '890203', vrServicio: 120000 })
  const result = await runFevDualValidation({
    rips,
    invoice: invoiceFor(rips, 120000),
  })
  assert(result.estado_dian === ESTADO_DIAN.APROBADO, `estado_dian=${result.estado_dian}`)
  assert(result.estado_minsalud_muv === ESTADO_MINSALUD_MUV.APROBADO, `MUV=${result.estado_minsalud_muv}`)
  assert(Boolean(result.codigo_cufe), 'Faltó CUFE')
  assert(Boolean(result.codigo_cuv), 'Faltó CUV')
  assert(result.listoParaEntrega === true, 'Debía estar lista para entrega')
  assert(result.rips?.cufe === result.codigo_cufe, 'El CUFE no quedó inyectado en el RIPS')
  assert(String(result.dianXml ?? '').includes(result.codigo_cufe), 'El XML no lleva el CUFE real')
  const stored = await getFevTransactionByFactura('FV1003')
  assert(stored?.codigo_cuv === result.codigo_cuv, 'El CUV no se persistió')
})

await rm(dataDir, { recursive: true, force: true })

if (failed > 0) {
  console.error(`\n${failed} caso(s) fallaron.`)
  process.exit(1)
}

console.log('\nSmoke flujo dual CUFE→CUV: 3/3 OK')
