/**
 * Observa la bandeja local de respuestas del Ministerio y persiste el CUV.
 * En la API REST el CUV llega en el JSON (RutaArchivos = null). El envío
 * deja ese JSON en disco para que este watcher lo registre, igual que cuando
 * la solución cliente-servidor deposita el archivo en una carpeta.
 */
import { watch } from 'node:fs'
import { mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { config } from '../config.js'
import { findCuvByCode, saveCuvRecord } from './cuvRepository.js'
import { classifyMinistryResponse } from './fevRipsProtocol.js'

export const CUV_INBOX_DIR = join(config.dataDir, 'cuv-inbox')
export const CUV_PROCESSED_DIR = join(config.dataDir, 'cuv-processed')
export const CUV_REJECTED_DIR = join(config.dataDir, 'cuv-rejected')

const processing = new Set()
const watched = new Set()
let started = false

async function ensureDirs() {
  await mkdir(CUV_INBOX_DIR, { recursive: true })
  await mkdir(CUV_PROCESSED_DIR, { recursive: true })
  await mkdir(CUV_REJECTED_DIR, { recursive: true })
}

function responseOf(payload) {
  if (payload && typeof payload === 'object' && payload.response && typeof payload.response === 'object') {
    return payload.response
  }
  return payload
}

/**
 * Registra el CUV si el Ministerio lo aprobó. Un mismo código no se duplica.
 * @param {object} response
 * @param {object} [meta]
 */
export async function persistCuvResponse(response, meta = {}) {
  const classified = classifyMinistryResponse(response)
  if (!classified.approved || !classified.cuv) {
    return { ok: false, classified }
  }

  const existing = await findCuvByCode(classified.cuv)
  if (existing) return { ok: true, duplicate: true, record: existing, classified }

  const record = await saveCuvRecord({
    cuv: classified.cuv,
    numFactura: classified.numFactura ?? meta.numFactura ?? null,
    numDocumentoIdObligado: meta.numDocumentoIdObligado ?? null,
    status: 'approved',
    procesoId: classified.procesoId,
    fechaRadicacion: classified.fechaRadicacion,
    estado: 'APROBADO',
    source: 'minsalud',
    metadatos: {
      modulo: classified.modulo,
      ambiente: classified.ambiente,
      origen: meta.origen ?? 'cuv-watcher',
      notificaciones: classified.notificaciones,
    },
  })
  return { ok: true, duplicate: false, record, classified }
}

async function moveFile(filePath, dir) {
  const target = join(dir, filePath.split('/').pop())
  await rename(filePath, target).catch(() => undefined)
  return target
}

/**
 * Lee un JSON de la bandeja y lo archiva en procesados o rechazados.
 * @param {string} filePath
 */
export async function processCuvFile(filePath) {
  if (!filePath.endsWith('.json') || processing.has(filePath)) return null
  processing.add(filePath)
  try {
    const raw = await readFile(filePath, 'utf8')
    const payload = JSON.parse(raw)
    const response = responseOf(payload)
    const meta = payload?.meta ?? {}
    const result = await persistCuvResponse(response, meta)
    const dest = result.ok ? CUV_PROCESSED_DIR : CUV_REJECTED_DIR
    await moveFile(filePath, dest)
    if (result.ok) {
      console.log(
        `[CUV watcher] Radicado persistido proceso=${result.classified.procesoId ?? 's/n'} cuv=${result.classified.cuv.slice(0, 12)}…`,
      )
    } else {
      const detail = result.classified.ministryErrors?.[0]?.message ?? 'sin CUV'
      console.error(`[CUV watcher] Respuesta sin radicado: ${detail}`)
    }
    return result
  } catch (error) {
    console.error('[CUV watcher] No se pudo procesar', filePath, error?.message ?? error)
    await moveFile(filePath, CUV_REJECTED_DIR)
    return null
  } finally {
    processing.delete(filePath)
  }
}

async function scanDir(dir) {
  let names = []
  try {
    names = await readdir(dir)
  } catch {
    return
  }
  for (const name of names) {
    if (!name.endsWith('.json')) continue
    await processCuvFile(join(dir, name))
  }
}

function watchDir(dir) {
  if (!dir || watched.has(dir)) return
  watched.add(dir)
  try {
    const watcher = watch(dir, { persistent: false }, (_event, filename) => {
      if (!filename || !String(filename).endsWith('.json')) return
      const filePath = join(dir, String(filename))
      setTimeout(() => {
        void processCuvFile(filePath)
      }, 150)
    })
    if (typeof watcher.unref === 'function') watcher.unref()
  } catch (error) {
    console.error('[CUV watcher] No se observa', dir, error?.message ?? error)
  }
}

/**
 * Deja la respuesta del Ministerio en la bandeja. El watcher la persiste.
 * @param {object} response
 * @param {object} [meta]
 */
export async function enqueueMinistryResponse(response, meta = {}) {
  await ensureDirs()
  const name = `cuv-${Date.now()}-${randomBytes(4).toString('hex')}.json`
  const filePath = join(CUV_INBOX_DIR, name)
  await writeFile(
    filePath,
    JSON.stringify({ receivedAt: new Date().toISOString(), meta, response }, null, 2),
    'utf8',
  )
  const ruta = response?.RutaArchivos ?? response?.rutaArchivos
  if (typeof ruta === 'string' && ruta.startsWith('/')) watchDir(ruta)
  return filePath
}

export async function startCuvWatcher() {
  if (started) return { enabled: true, inbox: CUV_INBOX_DIR }
  started = true
  await ensureDirs()
  watchDir(CUV_INBOX_DIR)
  const extra = String(process.env.MINSALUD_CUV_DIR ?? '').trim()
  if (extra) {
    await mkdir(extra, { recursive: true }).catch(() => undefined)
    watchDir(extra)
    await scanDir(extra)
  }
  await scanDir(CUV_INBOX_DIR)
  console.log(`[CUV watcher] Bandeja ${CUV_INBOX_DIR}`)
  return { enabled: true, inbox: CUV_INBOX_DIR }
}
