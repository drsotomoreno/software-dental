import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { config } from '../config.js'
import { readDurableJson, writeDurableJson } from './durableStore.js'
import { cargarFevRips } from './MinSaludService.js'

const STORE_FILE = join(config.dataDir, 'rips-transmission-queue.json')
const STORE_KEY = 'rips-transmission-queue'
const LOCK_TIMEOUT_MS = 2 * 60 * 1000
const MAX_AUDIT_LOGS = 2000

export const RIPS_QUEUE_MAX_ATTEMPTS = Number(process.env.RIPS_QUEUE_MAX_ATTEMPTS ?? 5)
export const RIPS_QUEUE_BASE_DELAY_MS = Number(process.env.RIPS_QUEUE_BASE_DELAY_MS ?? 1000)
export const RIPS_QUEUE_MAX_DELAY_MS = Number(process.env.RIPS_QUEUE_MAX_DELAY_MS ?? 60_000)
export const RIPS_QUEUE_CONCURRENCY = Number(process.env.RIPS_QUEUE_CONCURRENCY ?? 3)

const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504])
const NETWORK_CODES = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'ENOTFOUND',
  'EAI_AGAIN',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_SOCKET',
])

let writeChain = Promise.resolve()
let workerTimer = null
let workerBusy = false

function emptyState() {
  return { jobs: [], logs: [] }
}

function enqueueWrite(fn) {
  const next = writeChain.then(fn, fn)
  writeChain = next.then(
    () => undefined,
    () => undefined,
  )
  return next
}

async function loadState() {
  const stored = await readDurableJson(STORE_FILE, emptyState(), STORE_KEY)
  return {
    jobs: Array.isArray(stored?.jobs) ? stored.jobs : [],
    logs: Array.isArray(stored?.logs) ? stored.logs : [],
  }
}

async function saveState(state) {
  await writeDurableJson(STORE_FILE, state, STORE_KEY)
}

function sinSecretos(value) {
  if (!value || typeof value !== 'object') return value
  const rest = { ...value }
  delete rest.credencialesSispro
  delete rest.credencialesDescifradas
  delete rest.clave
  delete rest.password
  delete rest.credenciales
  return rest
}

function resumenTrabajo(job) {
  return {
    id: job.id,
    status: job.status,
    attempts: job.attempts,
    maxAttempts: job.maxAttempts,
    nextAttemptAt: job.nextAttemptAt,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    numFactura: job.rips?.numFactura ?? null,
    numDocumentoIdObligado: job.rips?.numDocumentoIdObligado ?? null,
    usuarios: Array.isArray(job.rips?.usuarios) ? job.rips.usuarios.length : 0,
    cuv: job.result?.cuv ?? null,
    endpoint: job.result?.endpoint ?? null,
    lastError: job.lastError ?? null,
    tieneCredenciales: Boolean(job.credenciales),
  }
}

/**
 * Espera exponencial con jitter. El intento 1 espera la base; cada fallo duplica el tiempo
 * hasta el tope, para no saturar al Ministerio cuando la red falla.
 * @param {number} attempt intento fallido (1 = primer fallo)
 * @param {() => number} [random]
 */
export function calcularBackoffMs(attempt, random = Math.random) {
  const step = Math.max(1, Number(attempt) || 1)
  const exponential = Math.min(
    RIPS_QUEUE_MAX_DELAY_MS,
    RIPS_QUEUE_BASE_DELAY_MS * 2 ** (step - 1),
  )
  const factor = 0.5 + Math.min(1, Math.max(0, random())) * 0.5
  return Math.round(exponential * factor)
}

export function isRetryableTransmissionError(resultOrError) {
  if (!resultOrError) return false
  if (resultOrError instanceof Error || resultOrError?.name) {
    const status = Number(resultOrError.status)
    if (RETRYABLE_STATUS.has(status)) return true
    const code = resultOrError.code || resultOrError.cause?.code
    if (NETWORK_CODES.has(code)) return true
    if (resultOrError.name === 'TypeError') return true
    if (resultOrError.retryable === true || resultOrError.code === 'RED') return true
    if (resultOrError instanceof Error) return false
  }
  const status = Number(resultOrError.httpStatus)
  if (RETRYABLE_STATUS.has(status)) return true
  return false
}

function appendLog(state, entry) {
  state.logs.unshift(entry)
  if (state.logs.length > MAX_AUDIT_LOGS) state.logs.length = MAX_AUDIT_LOGS
}

function auditar(state, job, event, extra = {}) {
  appendLog(state, {
    id: randomUUID(),
    jobId: job.id,
    event,
    at: new Date().toISOString(),
    attempt: extra.attempt ?? job.attempts,
    endpoint: extra.endpoint ?? job.result?.endpoint ?? '/api/PaquetesFevRips/CargarFevRips',
    numFactura: job.rips?.numFactura ?? null,
    numDocumentoIdObligado: job.rips?.numDocumentoIdObligado ?? null,
    httpStatus: extra.httpStatus ?? null,
    cuv: extra.cuv ?? null,
    error: extra.error ?? null,
    nextAttemptAt: extra.nextAttemptAt ?? null,
    durationMs: extra.durationMs ?? null,
  })
}

function errorMessage(resultOrError) {
  if (resultOrError instanceof Error) return resultOrError.message
  const ministry = resultOrError?.ministryErrors?.[0]?.message
  return ministry || resultOrError?.error || 'El Ministerio no aceptó el paquete RIPS.'
}

/**
 * Encola uno o varios paquetes. No llama al MUV: el worker los transmite después.
 * @param {Array<{ rips: object, metadatos?: object, credenciales?: object }>} paquetes
 */
export async function encolarPaquetesRips(paquetes) {
  const items = (Array.isArray(paquetes) ? paquetes : []).filter((item) => item?.rips)
  if (items.length === 0) {
    const error = new Error('Incluya al menos un paquete RIPS para encolar.')
    error.status = 400
    throw error
  }

  return enqueueWrite(async () => {
    const state = await loadState()
    const created = []
    const now = new Date().toISOString()
    for (const item of items) {
      const metadatos = sinSecretos(item.metadatos)
      const credenciales = item.credenciales ?? item.metadatos?.credencialesSispro ?? item.metadatos?.credencialesDescifradas
      const job = {
        id: randomUUID(),
        status: 'pendiente',
        attempts: 0,
        maxAttempts: RIPS_QUEUE_MAX_ATTEMPTS,
        nextAttemptAt: now,
        createdAt: now,
        updatedAt: now,
        lockedAt: null,
        rips: item.rips,
        metadatos: metadatos ?? {},
        credenciales: credenciales ?? null,
        result: null,
        lastError: null,
      }
      state.jobs.unshift(job)
      auditar(state, job, 'ENCOLADO', { attempt: 0, error: null })
      created.push(resumenTrabajo(job))
    }
    await saveState(state)
    return created
  })
}

export async function listarCola({ limit = 50 } = {}) {
  const state = await loadState()
  return state.jobs.slice(0, limit).map(resumenTrabajo)
}

export async function obtenerTrabajo(id) {
  const state = await loadState()
  const job = state.jobs.find((item) => item.id === id)
  if (!job) return null
  return {
    ...resumenTrabajo(job),
    rips: job.rips,
    metadatos: job.metadatos,
    result: job.result,
  }
}

export async function listarAuditoria({ jobId, limit = 100 } = {}) {
  const state = await loadState()
  const logs = jobId ? state.logs.filter((entry) => entry.jobId === jobId) : state.logs
  return logs.slice(0, limit)
}

function dueJobs(state, nowMs) {
  return state.jobs.filter((job) => {
    if (job.status === 'procesando') {
      const locked = Date.parse(job.lockedAt || '')
      return !Number.isFinite(locked) || nowMs - locked >= LOCK_TIMEOUT_MS
    }
    if (job.status !== 'pendiente' && job.status !== 'reintento') return false
    const next = Date.parse(job.nextAttemptAt || '')
    return !Number.isFinite(next) || next <= nowMs
  })
}

async function claimJobs(nowMs, concurrency) {
  return enqueueWrite(async () => {
    const state = await loadState()
    const selected = dueJobs(state, nowMs).slice(0, concurrency)
    const claimed = []
    for (const job of selected) {
      job.status = 'procesando'
      job.lockedAt = new Date(nowMs).toISOString()
      job.updatedAt = job.lockedAt
      claimed.push(structuredClone(job))
    }
    if (claimed.length > 0) await saveState(state)
    return claimed
  })
}

async function settleJob(jobId, outcome) {
  return enqueueWrite(async () => {
    const state = await loadState()
    const job = state.jobs.find((item) => item.id === jobId)
    if (!job) return null
    const now = new Date().toISOString()
    job.updatedAt = now
    job.lockedAt = null
    job.attempts += 1

    if (outcome.ok) {
      job.status = 'completado'
      job.lastError = null
      job.result = {
        cuv: outcome.cuv,
        procesoId: outcome.procesoId ?? null,
        endpoint: outcome.endpoint ?? '/api/PaquetesFevRips/CargarFevRips',
        source: outcome.source ?? null,
      }
      auditar(state, job, 'EXITO', {
        attempt: job.attempts,
        cuv: outcome.cuv,
        endpoint: job.result.endpoint,
        httpStatus: outcome.httpStatus ?? 200,
        durationMs: outcome.durationMs,
      })
    } else if (outcome.retryable && job.attempts < job.maxAttempts) {
      const delay = calcularBackoffMs(job.attempts)
      job.status = 'reintento'
      job.lastError = outcome.error
      job.nextAttemptAt = new Date(Date.now() + delay).toISOString()
      auditar(state, job, 'REINTENTO', {
        attempt: job.attempts,
        error: outcome.error,
        httpStatus: outcome.httpStatus ?? null,
        nextAttemptAt: job.nextAttemptAt,
        durationMs: outcome.durationMs,
        endpoint: outcome.endpoint,
      })
    } else {
      job.status = 'fallido'
      job.lastError = outcome.error
      auditar(state, job, 'FALLO', {
        attempt: job.attempts,
        error: outcome.error,
        httpStatus: outcome.httpStatus ?? null,
        durationMs: outcome.durationMs,
        endpoint: outcome.endpoint,
      })
    }

    await saveState(state)
    return resumenTrabajo(job)
  })
}

async function registrarIntento(job) {
  await enqueueWrite(async () => {
    const state = await loadState()
    const current = state.jobs.find((item) => item.id === job.id)
    if (!current) return
    auditar(state, current, 'INTENTO', { attempt: current.attempts + 1 })
    await saveState(state)
  })
}

async function transmitirTrabajo(job, transmit) {
  const started = Date.now()
  await registrarIntento(job)
  try {
    const result = await transmit({
      rips: job.rips,
      metadatos: job.metadatos,
      credenciales: job.credenciales,
    })
    if (result?.success && result.cuv) {
      return settleJob(job.id, {
        ok: true,
        cuv: result.cuv,
        procesoId: result.procesoId,
        endpoint: result.endpoint,
        source: result.source,
        durationMs: Date.now() - started,
      })
    }
    return settleJob(job.id, {
      ok: false,
      retryable: isRetryableTransmissionError(result),
      error: errorMessage(result),
      httpStatus: result?.httpStatus ?? null,
      endpoint: result?.endpoint,
      durationMs: Date.now() - started,
    })
  } catch (error) {
    return settleJob(job.id, {
      ok: false,
      retryable: isRetryableTransmissionError(error),
      error: errorMessage(error),
      httpStatus: error.status ?? null,
      durationMs: Date.now() - started,
    })
  }
}

/**
 * Toma los paquetes vencidos y los envía al MUV. Los fallos de red quedan en reintento.
 * @param {{ transmit?: Function, now?: number, concurrency?: number }} [options]
 */
export async function procesarColaUnaVez(options = {}) {
  if (workerBusy) return []
  workerBusy = true
  const nowMs = options.now ?? Date.now()
  const concurrency = options.concurrency ?? RIPS_QUEUE_CONCURRENCY
  const transmit = options.transmit ?? cargarFevRips
  try {
    const claimed = await claimJobs(nowMs, concurrency)
    if (claimed.length === 0) return []
    const settled = await Promise.all(claimed.map((job) => transmitirTrabajo(job, transmit)))
    return settled.filter(Boolean)
  } finally {
    workerBusy = false
  }
}

export function startRipsTransmissionWorker({ intervalMs = 1000 } = {}) {
  if (workerTimer) return
  workerTimer = setInterval(() => {
    void procesarColaUnaVez().catch((error) => {
      console.error('[RIPS cola]', error instanceof Error ? error.message : error)
    })
  }, intervalMs)
  if (typeof workerTimer.unref === 'function') workerTimer.unref()
  void procesarColaUnaVez().catch((error) => {
    console.error('[RIPS cola]', error instanceof Error ? error.message : error)
  })
}

export function stopRipsTransmissionWorker() {
  if (!workerTimer) return
  clearInterval(workerTimer)
  workerTimer = null
  workerBusy = false
}

export function isRipsTransmissionWorkerRunning() {
  return Boolean(workerTimer) || workerBusy
}
