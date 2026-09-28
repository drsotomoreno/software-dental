import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { facturaDesdeNombreResultados } from '../../shared/cuvResultadosMSPS.js'
import { leerArchivoResultadosMSPS } from './cuvResultadosArchivo.js'

const ESPERA_ESCRITURA_MS = 250
const MAX_PENDIENTES = 100

/** @type {import('node:fs').FSWatcher | null} */
let watcher = null
/** @type {Map<string, ReturnType<typeof setTimeout>>} */
const temporizadores = new Map()
/** @type {Map<string, string>} */
const firmasVistas = new Map()
/** @type {Array<ResultadoPendiente>} */
const pendientes = []
let directorioActual = ''

/**
 * @typedef {object} ResultadoPendiente
 * @property {string} id
 * @property {string} firma
 * @property {string} filePath
 * @property {string} nombre
 * @property {string} numFactura
 * @property {string} contenido
 * @property {boolean} aprobado
 * @property {string | null} cuv
 * @property {string} mensaje
 * @property {boolean} rechazado
 * @property {boolean} aplicado
 * @property {string} detectadoEn
 */

export function esArchivoResultadosMSPS(filename) {
  const base = path.basename(String(filename ?? ''))
  return /ResultadosMSPS_.+\.txt$/i.test(base) || base.includes('_A_CUV.txt')
}

function numFacturaDesdeNombre(filename, lectura) {
  return lectura?.numFactura || facturaDesdeNombreResultados(filename) || filename.split('_')[1] || 'DESCONOCIDO'
}

export function listarResultadosMSPSPendientes() {
  return pendientes.filter((item) => !item.aplicado)
}

export function marcarResultadoMSPSAplicado(id) {
  const item = pendientes.find((entrada) => entrada.id === id)
  if (!item) return false
  item.aplicado = true
  return true
}

export function estadoWatcherResultadosMSPS() {
  return {
    activo: Boolean(watcher),
    directorio: directorioActual,
  }
}

export function detenerWatcherResultadosMSPS() {
  for (const timer of temporizadores.values()) clearTimeout(timer)
  temporizadores.clear()
  watcher?.close()
  watcher = null
  directorioActual = ''
}

function encolar(item) {
  const repetido = pendientes.some((entrada) => entrada.filePath === item.filePath && entrada.firma === item.firma)
  if (repetido) return
  pendientes.push(item)
  if (pendientes.length > MAX_PENDIENTES) pendientes.shift()
}

async function procesarDetectado(directorioSalida, filename, reintento) {
  if (!esArchivoResultadosMSPS(filename)) return
  const filePath = path.join(directorioSalida, filename)
  try {
    let stats = await fs.promises.stat(filePath)
    if (!stats.isFile() || stats.size === 0) return
    await new Promise((resolve) => setTimeout(resolve, ESPERA_ESCRITURA_MS))
    const estable = await fs.promises.stat(filePath)
    if (!estable.isFile() || estable.size === 0) return
    if (estable.size !== stats.size) {
      programar(directorioSalida, filename, false)
      return
    }
    stats = estable
    const firma = `${stats.mtimeMs}:${stats.size}`
    if (firmasVistas.get(filePath) === firma) return

    const lectura = await leerArchivoResultadosMSPS(filePath)
    const numFactura = numFacturaDesdeNombre(filename, lectura)
    firmasVistas.set(filePath, firma)
    encolar({
      id: randomUUID(),
      firma,
      filePath,
      nombre: filename,
      numFactura,
      contenido: lectura.contenido,
      aprobado: lectura.aprobado,
      cuv: lectura.cuv,
      mensaje: lectura.mensaje,
      rechazado: Boolean(lectura.rechazado),
      aplicado: false,
      detectadoEn: new Date().toISOString(),
    })
    if (lectura.aprobado && lectura.cuv) {
      console.log(`[RIPS Watcher] Archivo detectado para la factura: ${numFactura}. CUV listo para Dexie.`)
    } else {
      console.warn(`[RIPS Watcher] Archivo de ${numFactura} sin CUV aplicable: ${lectura.mensaje}`)
    }
  } catch (error) {
    if (error?.code === 'ENOENT') {
      if (!reintento) programar(directorioSalida, filename, true)
      return
    }
    console.error(`[RIPS Watcher] Error leyendo el archivo ${filename}:`, error?.message ?? error)
  }
}

function programar(directorioSalida, filename, reintento) {
  const previo = temporizadores.get(filename)
  if (previo) clearTimeout(previo)
  const timer = setTimeout(() => {
    temporizadores.delete(filename)
    void procesarDetectado(directorioSalida, filename, reintento)
  }, ESPERA_ESCRITURA_MS)
  temporizadores.set(filename, timer)
}

/**
 * Vigila la carpeta donde el cliente-servidor del Ministerio deja los .txt.
 * Cada archivo nuevo queda pendiente para que la aplicación lo escriba en Dexie.
 * @param {string} directorioSalida
 */
export function iniciarWatcherResultadosMSPS(directorioSalida) {
  const directorio = path.resolve(String(directorioSalida ?? ''))
  console.log(`[RIPS Watcher] Monitoreando directorio: ${directorio}`)
  try {
    const info = fs.statSync(directorio)
    if (!info.isDirectory()) {
      throw new Error('La ruta de resultados no es una carpeta.')
    }
  } catch (error) {
    console.error(`[RIPS Watcher] Error al iniciar el watcher en el directorio: ${error.message}`)
    return null
  }

  detenerWatcherResultadosMSPS()
  directorioActual = directorio

  try {
    const existentes = fs.readdirSync(directorio)
    for (const filename of existentes) programar(directorio, filename, false)
  } catch (error) {
    console.error(`[RIPS Watcher] No se pudo leer la carpeta inicial: ${error.message}`)
  }

  try {
    watcher = fs.watch(directorio, (eventType, filename) => {
      if (!filename) return
      if (eventType !== 'rename' && eventType !== 'change') return
      programar(directorio, String(filename), false)
    })
    watcher.on('error', (error) => {
      console.error(`[RIPS Watcher] Error al vigilar la carpeta: ${error.message}`)
    })
  } catch (error) {
    console.error(`[RIPS Watcher] Error al iniciar el watcher en el directorio: ${error.message}`)
    watcher = null
    return null
  }

  return watcher
}
