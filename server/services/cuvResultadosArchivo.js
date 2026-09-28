import { readFile } from 'node:fs/promises'
import { basename } from 'node:path'
import { interpretarResultadosMSPS, facturaDesdeNombreResultados } from '../../shared/cuvResultadosMSPS.js'

/**
 * Lee ResultadosMSPS_[factura]_[ID]_A_CUV.txt desde disco.
 * La escritura en Dexie ocurre en el navegador, con el mismo intérprete.
 */
export async function leerArchivoResultadosMSPS(filePath) {
  const contenido = await readFile(filePath, 'utf-8')
  const nombre = basename(filePath)
  const lectura = interpretarResultadosMSPS(contenido, nombre)
  return {
    ...lectura,
    numFactura: facturaDesdeNombreResultados(nombre),
    nombre,
  }
}
