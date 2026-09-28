import { db } from '@/db/database'
import type { LocalRipsRecord } from '@/db/localRipsDatabase'
import {
  facturaDesdeNombreResultados,
  interpretarResultadosMSPS,
} from '../../shared/cuvResultadosMSPS.js'

export interface ResultadoProcesoCuv {
  success: boolean
  cuv?: string
  error?: string
}

function normalizarFactura(value: string) {
  return value.replace(/[^A-Za-z0-9]/g, '').toUpperCase()
}

async function registrosDeFactura(numFactura: string): Promise<LocalRipsRecord[]> {
  const exactos = await db.ripsRecords.where('numFactura').equals(numFactura).toArray()
  if (exactos.length > 0) return exactos
  const objetivo = normalizarFactura(numFactura)
  if (!objetivo) return []
  const todos = await db.ripsRecords.toArray()
  return todos.filter((row) => normalizarFactura(row.numFactura) === objetivo)
}

/**
 * Interpreta el texto de ResultadosMSPS y escribe el CUV en el RIPS local de esa factura.
 */
export async function aplicarResultadoMSPS(
  numFactura: string,
  contenido: string,
  nombreArchivo = '',
): Promise<ResultadoProcesoCuv> {
  const lectura = interpretarResultadosMSPS(contenido, nombreArchivo)
  const factura = numFactura || facturaDesdeNombreResultados(nombreArchivo) || ''
  const registros = await registrosDeFactura(factura)
  if (registros.length === 0) {
    return {
      success: false,
      error: `No hay un RIPS local para la factura ${factura || 'indicada'}.`,
    }
  }

  const ordenados = [...registros].sort((a, b) => (b.id ?? 0) - (a.id ?? 0))

  if (!lectura.aprobado || !lectura.cuv) {
    if (lectura.rechazado) {
      await Promise.all(
        ordenados
          .filter((row) => row.id != null)
          .map((row) =>
            db.ripsRecords.update(row.id!, {
              estadoValidacion: 'RECHAZADO',
              mensajeRespuesta: lectura.mensaje,
            }),
          ),
      )
    }
    return { success: false, error: lectura.mensaje }
  }

  const destino = ordenados[0]
  if (destino.id == null) {
    return { success: false, error: 'El registro local no tiene identificador.' }
  }

  await db.ripsRecords.update(destino.id, {
    estadoValidacion: 'APROBADO_MSPS',
    cuv: lectura.cuv,
    mensajeRespuesta: lectura.mensaje,
    fechaValidacionCentral: new Date(),
  })

  return { success: true, cuv: lectura.cuv }
}

/**
 * Lee el archivo de resultados del Ministerio y actualiza Dexie.
 * En el navegador el origen es el archivo elegido por el odontólogo.
 */
export async function procesarArchivoResultadosMSPS(
  archivo: File,
  numFactura: string,
): Promise<ResultadoProcesoCuv> {
  try {
    const contenido = await archivo.text()
    return aplicarResultadoMSPS(numFactura, contenido, archivo.name)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'error desconocido'
    return { success: false, error: `Error procesando el archivo de resultados: ${message}` }
  }
}
