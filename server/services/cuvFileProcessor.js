import { readFile } from 'node:fs/promises'
import {
  findCuvRecordByFactura,
  findPendingCuvByFactura,
  saveCuvRecord,
  updateCuvRecord,
} from './cuvRepository.js'

/**
 * Extrae ESTADO, MENSAJE, CUV y FECHA del texto que devuelve el MSPS.
 * @param {string} text
 */
export function parseResultadosMsps(text) {
  const fields = {}
  for (const line of String(text).split(/\r?\n/)) {
    const separator = line.indexOf(':')
    if (separator === -1) continue
    const key = line.slice(0, separator).trim().toUpperCase()
    const value = line.slice(separator + 1).trim()
    if (key) fields[key] = value
  }
  return {
    estado: fields.ESTADO ?? '',
    mensaje: fields.MENSAJE ?? '',
    cuv: fields.CUV ?? '',
    fecha: fields.FECHA ?? '',
  }
}

/**
 * Lee un archivo de resultados MSPS y persiste el CUV en el registro local.
 * Si la factura ya tiene un registro pendiente, lo pasa a aprobado sin duplicarlo.
 * @param {string} rutaArchivo
 * @param {string} numFactura
 * @returns {Promise<{success: true, cuv: string} | {success: false, error: string}>}
 */
export async function procesarArchivoResultadosMSPS(rutaArchivo, numFactura) {
  let raw
  try {
    raw = await readFile(rutaArchivo, 'utf8')
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { success: false, error: `No se pudo leer el archivo: ${message}` }
  }

  const parsed = parseResultadosMsps(raw)
  if (parsed.estado.toUpperCase() !== 'APROBADO') {
    return { success: false, error: `Estado no aprobado: ${parsed.estado || '(vacío)'}` }
  }
  if (!parsed.cuv) {
    return { success: false, error: 'El archivo no contiene CUV.' }
  }

  const patch = {
    cuv: parsed.cuv,
    numFactura,
    status: 'approved',
    estado: parsed.estado,
    estadoValidacion: 'APROBADO',
    mensaje: parsed.mensaje,
    fechaRadicacion: parsed.fecha || new Date().toISOString(),
    source: 'msps-file',
  }

  const pending = await findPendingCuvByFactura(numFactura)
  if (pending) {
    const updated = await updateCuvRecord(pending.id, patch)
    return { success: true, cuv: updated.cuv }
  }

  const existing = await findCuvRecordByFactura(numFactura)
  if (existing?.status === 'approved' && existing.cuv === parsed.cuv) {
    return { success: true, cuv: existing.cuv }
  }

  const created = await saveCuvRecord({
    ...patch,
    numDocumentoIdObligado: existing?.numDocumentoIdObligado ?? '',
  })
  return { success: true, cuv: created.cuv }
}
