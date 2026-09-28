import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { findCuvRecordByFactura, saveCuvRecord } from '../server/services/cuvRepository.js'
import { procesarArchivoResultadosMSPS } from '../server/services/cuvFileProcessor.js'

const numFacturaPrueba = 'FEV-1024'
const cuvEsperado = 'CUV-COL-2026-99887766-ABCDE'
const directorioSimulado = path.join(process.cwd(), 'salida_msps_mock')

const existe = await findCuvRecordByFactura(numFacturaPrueba)
if (!existe) {
  await saveCuvRecord({
    numFactura: numFacturaPrueba,
    numDocumentoIdObligado: '900123456',
    tipoNota: null,
    payloadJson: '{}',
    status: 'pending',
    estadoValidacion: 'PENDIENTE',
  })
  console.log(`[Simulador] Registro creado para la factura ${numFacturaPrueba}`)
}

await mkdir(directorioSimulado, { recursive: true })

const nombreArchivoMock = `ResultadosMSPS_${numFacturaPrueba}_9999_A_CUV.txt`
const rutaArchivoMock = path.join(directorioSimulado, nombreArchivoMock)
const contenidoMock = `
ESTADO: APROBADO
MENSAJE: El lote de RIPS y FEV ha sido validado exitosamente.
CUV: ${cuvEsperado}
FECHA: 2026-09-28T16:00:00
`.trim()

await writeFile(rutaArchivoMock, contenidoMock)
console.log(`[Simulador] Archivo de respuesta creado en: ${rutaArchivoMock}`)

const resultado = await procesarArchivoResultadosMSPS(rutaArchivoMock, numFacturaPrueba)
if (!resultado.success) {
  console.error(`[Simulador] Error: ${resultado.error}`)
  process.exitCode = 1
} else {
  console.log(`[Simulador] ¡ÉXITO! CUV capturado y guardado: ${resultado.cuv}`)
  const registroFinal = await findCuvRecordByFactura(numFacturaPrueba)
  console.log('[Simulador] Estado actual:', registroFinal)
  if (registroFinal?.status !== 'approved' || registroFinal?.cuv !== cuvEsperado) {
    console.error('[Simulador] El registro final no quedó aprobado con el CUV esperado.')
    process.exitCode = 1
  }
}
