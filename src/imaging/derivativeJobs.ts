import { db } from '@/db/database'
import { getDiagnosticAidBlobByAidId } from '@/services/diagnosticAidBlobStore'
import {
  replaceDerivativesForAid,
  updateViewerMeta,
} from '@/services/diagnosticAidDerivativeStore'
import type { DiagnosticAid } from '@/types/diagnosticAid'
import { getDesktopBridge } from '@/types/desktopBridge'
import {
  inferStudyKindFromFileName,
  needsDerivativeProcessing,
  resolveStudyKind,
} from '@/utils/diagnosticAidWebClassification'
import type {
  ProcessStudyWorkerRequest,
  ProcessStudyWorkerResponse,
} from '@/imaging/workers/processStudy.worker'

const queue: string[] = []
const queued = new Set<string>()
let draining = false
let worker: Worker | null = null
let workerFailed = false

function getWorker(): Worker | null {
  if (workerFailed) return null
  if (worker) return worker
  try {
    worker = new Worker(new URL('./workers/processStudy.worker.ts', import.meta.url), {
      type: 'module',
    })
    return worker
  } catch (error) {
    console.warn('Worker de estudios no disponible, se procesará en el hilo principal.', error)
    workerFailed = true
    return null
  }
}

function runInWorker(input: ProcessStudyWorkerRequest['input']) {
  const instance = getWorker()
  if (!instance) return null
  const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`
  return new Promise<ProcessStudyWorkerResponse>((resolve, reject) => {
    const onMessage = (event: MessageEvent<ProcessStudyWorkerResponse>) => {
      if (event.data.id !== id) return
      instance.removeEventListener('message', onMessage)
      instance.removeEventListener('error', onError)
      resolve(event.data)
    }
    const onError = (event: ErrorEvent) => {
      instance.removeEventListener('message', onMessage)
      instance.removeEventListener('error', onError)
      workerFailed = true
      worker = null
      reject(event.error ?? new Error(event.message || 'Worker de estudios falló.'))
    }
    instance.addEventListener('message', onMessage)
    instance.addEventListener('error', onError)
    const message: ProcessStudyWorkerRequest = { id, input }
    instance.postMessage(message, [input.data])
  })
}

async function readSourceBuffer(entry: DiagnosticAid): Promise<ArrayBuffer> {
  const blob = await getDiagnosticAidBlobByAidId(entry.id)
  if (blob) {
    return blob.data.slice(0)
  }
  const bridge = getDesktopBridge()
  if (bridge?.readDiagnosticFile && entry.absolutePath && !entry.absolutePath.startsWith('[navegador]/')) {
    return bridge.readDiagnosticFile(entry.absolutePath)
  }
  throw new Error('No hay copia local del archivo para generar el visor.')
}

export async function enqueueDerivativeJob(aidId: string): Promise<void> {
  if (queued.has(aidId)) return
  queued.add(aidId)
  queue.push(aidId)
  void drainQueue()
}

export async function resumePendingDerivativeJobs(patientId: string): Promise<void> {
  const pending = await db.diagnosticAids.where('patientId').equals(patientId).toArray()
  for (const entry of pending) {
    if (entry.viewerStatus === 'processing') {
      await enqueueDerivativeJob(entry.id)
    }
  }
}

export async function enqueueDerivativeJobForEntry(entry: DiagnosticAid): Promise<void> {
  const kind = resolveStudyKind(entry)
  if (!needsDerivativeProcessing(kind)) {
    await updateViewerMeta(entry.id, { studyKind: kind, viewerStatus: 'ready', viewerError: '' })
    return
  }
  await updateViewerMeta(entry.id, {
    studyKind: kind,
    viewerStatus: 'processing',
    viewerError: '',
  })
  await enqueueDerivativeJob(entry.id)
}

async function drainQueue(): Promise<void> {
  if (draining) return
  draining = true
  try {
    while (queue.length) {
      const aidId = queue.shift()
      if (!aidId) continue
      try {
        await processAid(aidId)
      } catch (error) {
        await updateViewerMeta(aidId, {
          viewerStatus: 'failed',
          viewerError: error instanceof Error ? error.message : 'No se pudo optimizar el estudio.',
        })
      } finally {
        queued.delete(aidId)
      }
    }
  } finally {
    draining = false
    if (queue.length) void drainQueue()
  }
}

async function processAid(aidId: string): Promise<void> {
  const entry = await db.diagnosticAids.get(aidId)
  if (!entry) return
  const studyKind = resolveStudyKind(entry)
  if (!needsDerivativeProcessing(studyKind)) {
    await updateViewerMeta(aidId, { studyKind, viewerStatus: 'ready', viewerError: '' })
    return
  }

  await updateViewerMeta(aidId, { studyKind, viewerStatus: 'processing', viewerError: '' })

  const bridge = getDesktopBridge()
  if (
    studyKind === 'mesh3d' &&
    bridge?.convertStlToGlb &&
    entry.absolutePath &&
    !entry.absolutePath.startsWith('[navegador]/')
  ) {
    try {
      const glb = await bridge.convertStlToGlb(entry.absolutePath)
      await replaceDerivativesForAid(aidId, [
        { kind: 'glb', mimeType: 'model/gltf-binary', data: glb },
      ])
      await updateViewerMeta(aidId, {
        studyKind: 'mesh3d',
        viewerStatus: 'ready',
        viewerError: '',
      })
      return
    } catch {
      // Si Electron falla, se intenta el worker del renderer.
    }
  }

  const data = await readSourceBuffer(entry)
  const input = { fileName: entry.fileName, data }

  let output
  try {
    const workerResult = await runInWorker(input)
    if (workerResult) {
      if (!workerResult.ok) throw new Error(workerResult.error)
      output = workerResult.result
    } else {
      const { processStudy } = await import('@/imaging/processStudy')
      output = await processStudy(input)
    }
  } catch {
    const { processStudy } = await import('@/imaging/processStudy')
    output = await processStudy({ fileName: entry.fileName, data: await readSourceBuffer(entry) })
  }

  await replaceDerivativesForAid(aidId, output.derivatives)
  await updateViewerMeta(aidId, {
    studyKind: output.studyKind || inferStudyKindFromFileName(entry.fileName),
    viewerStatus: 'ready',
    viewerError: '',
    sliceCount: output.sliceCount,
  })
}
