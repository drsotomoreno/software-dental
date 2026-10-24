/**
 * Cierre de jornada: lee la cola Dexie y la radica en POST /api/rips/send-batch.
 * El servidor responde 202; este módulo espera el resultado y guarda CUV o errores.
 * Las llamadas usan fetch, igual que el resto del cliente de la API.
 */
import { db } from '@/db/database'
import {
  markRipsErrorRetry,
  markRipsProcessing,
  markRipsSynchronized,
  restoreRipsAfterFailedSync,
} from '@/db/ripsQueueStore'
import { getStoredApiAuth } from '@/services/apiAuthService'
import type { RipsQueueEntry, RipsQueueError } from '@/types/ripsQueue'
import {
  RIPS_BATCH_LIMIT,
  decisionDeResultado,
  entradaListaParaMuv,
  partirEnLotes,
  procesoAtascado,
  type RipsBatchItemResult,
} from '@/services/ripsSyncPlan'

const API_BASE = import.meta.env.VITE_RIPS_API_URL ?? '/api/rips'
const PENDING_KEY = 'mihistoriadental.ripsDailyBatch'
const IDLE_GAP_MS = 5 * 60 * 1000
const POLL_DEADLINE_MS = 30 * 60 * 1000

export type RipsSyncReason = 'online' | 'idle' | 'manual' | 'resume'

export interface RipsDailyBatchResult {
  status: 'empty' | 'skipped' | 'done' | 'failed'
  reason?: 'offline' | 'sin_sesion' | 'en_curso' | 'espera'
  sent: number
  synchronized: number
  rejected: number
  message: string
}

export interface RipsSyncSnapshot {
  phase: 'idle' | 'running'
  last: RipsDailyBatchResult | null
}

interface PendingBatch {
  batchId: string
  evolutionIds: string[]
  at: number
}

interface BatchView {
  status: 'processing' | 'done'
  items: RipsBatchItemResult[]
}

type SyncDeps = {
  list: () => Promise<RipsQueueEntry[]>
  claim: (evolutionId: string) => Promise<unknown>
  finishOk: (evolutionId: string, cuv: string) => Promise<unknown>
  finishError: (evolutionId: string, errors: RipsQueueError[]) => Promise<unknown>
  restore: (evolutionId: string, status: 'QUEUED' | 'ERROR_RETRY', errors?: RipsQueueError[]) => Promise<unknown>
  postBatch: (items: object[]) => Promise<{ batchId: string }>
  pollBatch: (batchId: string) => Promise<BatchView>
  online: () => boolean
  session: () => boolean
  now: () => number
  sleep: (ms: number) => Promise<void>
}

const listeners = new Set<() => void>()
let snapshot: RipsSyncSnapshot = { phase: 'idle', last: null }
let inflight: Promise<RipsDailyBatchResult> | null = null
let lastIdleRun = 0

function emit(next: RipsSyncSnapshot) {
  snapshot = next
  for (const listener of listeners) listener()
}

export function subscribeRipsSync(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getRipsSyncSnapshot(): RipsSyncSnapshot {
  return snapshot
}

function identityHeaders(): Record<string, string> {
  const auth = getStoredApiAuth()
  return {
    Accept: 'application/json',
    ...(auth?.token ? { Authorization: `Bearer ${auth.token}` } : {}),
    ...(auth?.user?.email ? { 'X-Client-Email': String(auth.user.email) } : {}),
    ...(auth?.user?.id ? { 'X-Client-User-Id': String(auth.user.id) } : {}),
    ...(auth?.user?.documentNumber ? { 'X-Client-Document': String(auth.user.documentNumber) } : {}),
  }
}

function readPending(): PendingBatch | null {
  try {
    const raw = sessionStorage.getItem(PENDING_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as PendingBatch
    if (!parsed?.batchId || !Array.isArray(parsed.evolutionIds)) return null
    return parsed
  } catch {
    return null
  }
}

function writePending(batch: PendingBatch | null) {
  try {
    if (!batch) sessionStorage.removeItem(PENDING_KEY)
    else sessionStorage.setItem(PENDING_KEY, JSON.stringify(batch))
  } catch {
    /* el modo privado puede bloquear sessionStorage; el lote sigue en memoria */
  }
}

async function defaultList(): Promise<RipsQueueEntry[]> {
  return db.rips_queue.where('status').anyOf('QUEUED', 'ERROR_RETRY', 'PROCESSING').toArray()
}

async function consultarLote(batchId: string): Promise<BatchView> {
  const response = await fetch(`${API_BASE}/send-batch/${encodeURIComponent(batchId)}`, {
    headers: identityHeaders(),
  })
  const data = (await response.json().catch(() => null)) as
    | (BatchView & { error?: string; items?: RipsBatchItemResult[] })
    | null
  if (response.status === 404) {
    const error = new Error('El servidor ya no tiene el resultado de este lote.')
    ;(error as Error & { status?: number }).status = 404
    throw error
  }
  if (!response.ok || !data) {
    throw new Error(data?.error || `No se pudo consultar el lote RIPS (HTTP ${response.status}).`)
  }
  return { status: data.status, items: Array.isArray(data.items) ? data.items : [] }
}

async function enviarLote(items: object[]): Promise<{ batchId: string }> {
  const response = await fetch(`${API_BASE}/send-batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...identityHeaders() },
    body: JSON.stringify(items),
  })
  const data = (await response.json().catch(() => null)) as { batchId?: string; error?: string; accepted?: boolean } | null
  if (response.status === 401) throw new Error('Sesión inválida o expirada.')
  if (!response.ok || !data?.batchId) {
    throw new Error(data?.error || `El servidor no aceptó el lote RIPS (HTTP ${response.status}).`)
  }
  return { batchId: data.batchId }
}

async function esperarLote(batchId: string, sleep: (ms: number) => Promise<void>): Promise<BatchView> {
  const deadline = Date.now() + POLL_DEADLINE_MS
  let wait = 400
  while (Date.now() < deadline) {
    const view = await consultarLote(batchId)
    if (view.status === 'done') return view
    await sleep(wait)
    wait = Math.min(2_000, Math.round(wait * 1.4))
  }
  throw new Error('El lote no confirmó el CUV a tiempo. Se reintentará más tarde.')
}

function delay(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

function defaultDeps(): SyncDeps {
  return {
    list: defaultList,
    claim: markRipsProcessing,
    finishOk: (evolutionId, cuv) => markRipsSynchronized(evolutionId, cuv),
    finishError: markRipsErrorRetry,
    restore: restoreRipsAfterFailedSync,
    postBatch: enviarLote,
    pollBatch: (batchId) => esperarLote(batchId, delay),
    online: () => (typeof navigator === 'undefined' ? true : navigator.onLine),
    session: () => Boolean(getStoredApiAuth()?.token),
    now: () => Date.now(),
    sleep: delay,
  }
}

async function aplicarResultados(
  items: RipsBatchItemResult[],
  deps: SyncDeps,
): Promise<{ synchronized: number; rejected: number }> {
  let synchronized = 0
  let rejected = 0
  for (const item of items) {
    const evolutionId = String(item.evolutionId ?? '').trim()
    if (!evolutionId) continue
    const decision = decisionDeResultado(item)
    try {
      if (decision.kind === 'synchronized') {
        await deps.finishOk(evolutionId, decision.cuv)
        synchronized += 1
      } else {
        await deps.finishError(evolutionId, decision.errors)
        rejected += 1
      }
    } catch (error) {
      console.error('[rips-sync] no se pudo actualizar la cola local', {
        evolutionId,
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }
  return { synchronized, rejected }
}

async function restaurar(entries: RipsQueueEntry[], deps: SyncDeps) {
  for (const entry of entries) {
    const status = entry.status === 'ERROR_RETRY' ? 'ERROR_RETRY' : 'QUEUED'
    try {
      await deps.restore(entry.evolutionId, status, entry.errors)
    } catch (error) {
      console.error('[rips-sync] no se pudo devolver el RIPS a la cola', {
        evolutionId: entry.evolutionId,
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }
}

async function recuperarAtascados(rows: RipsQueueEntry[], deps: SyncDeps) {
  const now = deps.now()
  for (const entry of rows) {
    if (!procesoAtascado(entry, now)) continue
    try {
      await deps.restore(entry.evolutionId, 'QUEUED', entry.errors)
      entry.status = 'QUEUED'
    } catch (error) {
      console.error('[rips-sync] no se pudo recuperar un envío abandonado', {
        evolutionId: entry.evolutionId,
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }
}

function sobreDe(entry: RipsQueueEntry) {
  return {
    rips: entry.jsonPayload,
    cufe: entry.cufe ?? '',
    evolutionId: entry.evolutionId,
    patientId: entry.patientId,
  }
}

function resultado(partial: Omit<RipsDailyBatchResult, 'sent' | 'synchronized' | 'rejected'> & Partial<RipsDailyBatchResult>): RipsDailyBatchResult {
  return {
    sent: 0,
    synchronized: 0,
    rejected: 0,
    ...partial,
  }
}

async function ejecutar(reason: RipsSyncReason, deps: SyncDeps): Promise<RipsDailyBatchResult> {
  if (!deps.session()) {
    return resultado({ status: 'skipped', reason: 'sin_sesion', message: 'Inicia sesión para enviar los RIPS del día.' })
  }

  let sent = 0
  let synchronized = 0
  let rejected = 0
  const pending = readPending()
  if (pending && deps.now() - pending.at < POLL_DEADLINE_MS) {
    try {
      const view = await deps.pollBatch(pending.batchId)
      const applied = await aplicarResultados(view.items, deps)
      writePending(null)
      sent += applied.synchronized + applied.rejected
      synchronized += applied.synchronized
      rejected += applied.rejected
      console.info('[rips-sync] lote reanudado', { batchId: pending.batchId, ...applied })
    } catch (error) {
      const missing = (error as { status?: number }).status === 404
      if (!missing) {
        return resultado({
          status: 'failed',
          message: error instanceof Error ? error.message : 'No se pudo confirmar el lote en curso.',
        })
      }
      writePending(null)
    }
  } else if (pending) {
    writePending(null)
  }

  if (!deps.online()) {
    if (sent > 0) {
      return resultado({
        status: 'done',
        sent,
        synchronized,
        rejected,
        message: `Se confirmaron ${synchronized} RIPS del lote en curso.`,
      })
    }
    return resultado({
      status: 'skipped',
      reason: 'offline',
      message: 'Sin conexión. Los RIPS se enviarán al reconectar.',
    })
  }

  const rows = await deps.list()
  await recuperarAtascados(rows, deps)
  const ready = rows.filter(entradaListaParaMuv)
  if (ready.length === 0) {
    if (sent > 0) {
      return resultado({
        status: 'done',
        sent,
        synchronized,
        rejected,
        message:
          rejected > 0
            ? `Se confirmaron ${synchronized} RIPS. ${rejected} quedaron con error.`
            : `Se confirmaron ${synchronized} RIPS del lote en curso.`,
      })
    }
    return resultado({ status: 'empty', message: 'No hay RIPS pendientes para el cierre de jornada.' })
  }

  const lotes = partirEnLotes(ready, RIPS_BATCH_LIMIT)

  for (const lote of lotes) {
    const claimed: RipsQueueEntry[] = []
    for (const entry of lote) {
      try {
        await deps.claim(entry.evolutionId)
        claimed.push(entry)
      } catch (error) {
        console.warn('[rips-sync] no se reclamó la evolución', {
          evolutionId: entry.evolutionId,
          message: error instanceof Error ? error.message : String(error),
        })
      }
    }
    if (claimed.length === 0) continue

    let acceptedId: string | null = null
    try {
      const accepted = await deps.postBatch(claimed.map(sobreDe))
      acceptedId = accepted.batchId
      writePending({ batchId: accepted.batchId, evolutionIds: claimed.map((entry) => entry.evolutionId), at: deps.now() })
      console.info('[rips-sync] lote aceptado', { reason, batchId: accepted.batchId, count: claimed.length })
      const view = await deps.pollBatch(accepted.batchId)
      writePending(null)
      const applied = await aplicarResultados(view.items, deps)
      sent += claimed.length
      synchronized += applied.synchronized
      rejected += applied.rejected
    } catch (error) {
      const missing = (error as { status?: number }).status === 404
      const message = error instanceof Error ? error.message : 'No se pudo enviar el lote RIPS.'
      if (acceptedId && !missing) {
        console.error('[rips-sync] el lote sigue en el servidor', { batchId: acceptedId, message })
        return resultado({
          status: 'failed',
          sent,
          synchronized,
          rejected,
          message: 'El lote fue aceptado, pero aún no llega el CUV. Se confirmará al reconectar.',
        })
      }
      writePending(null)
      await restaurar(claimed, deps)
      console.error('[rips-sync] lote devuelto a la cola', { message })
      if (sent === 0) return resultado({ status: 'failed', message })
      return resultado({
        status: 'done',
        sent,
        synchronized,
        rejected,
        message: `${message} Los RIPS ya confirmados se conservaron.`,
      })
    }
  }

  if (sent === 0) {
    return resultado({ status: 'empty', message: 'No hay RIPS pendientes para el cierre de jornada.' })
  }

  const message =
    rejected > 0
      ? `Cierre de jornada: ${synchronized} con CUV y ${rejected} con error del MUV.`
      : `Cierre de jornada: ${synchronized} RIPS sincronizados.`
  console.info('[rips-sync] lote terminado', { reason, sent, synchronized, rejected })
  return resultado({ status: 'done', sent, synchronized, rejected, message })
}

/**
 * Envía los RIPS en QUEUED o ERROR_RETRY.
 * Un disparo automático durante la inactividad no se repite antes de cinco minutos.
 * Si ya hay un lote en curso, se reutiliza esa misma ejecución.
 */
export async function processDailyRipsBatch(
  options: { reason?: RipsSyncReason; deps?: SyncDeps } = {},
): Promise<RipsDailyBatchResult> {
  const reason = options.reason ?? 'manual'
  if (reason === 'idle' && Date.now() - lastIdleRun < IDLE_GAP_MS) {
    return resultado({
      status: 'skipped',
      reason: 'espera',
      message: 'El cierre automático espera a que pase el intervalo de inactividad.',
    })
  }
  if (inflight) return inflight

  if (reason === 'idle') lastIdleRun = Date.now()
  const deps = options.deps ?? defaultDeps()
  emit({ ...snapshot, phase: 'running' })
  inflight = ejecutar(reason, deps)
    .then((result) => {
      emit({ phase: 'idle', last: result })
      return result
    })
    .catch((error: unknown) => {
      const failed = resultado({
        status: 'failed',
        message: error instanceof Error ? error.message : 'No se pudo cerrar la jornada RIPS.',
      })
      emit({ phase: 'idle', last: failed })
      return failed
    })
    .finally(() => {
      inflight = null
    })
  return inflight
}
