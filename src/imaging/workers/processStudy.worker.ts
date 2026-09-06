import { processStudy, type ProcessStudyInput, type ProcessStudyOutput } from '@/imaging/processStudy'

export type ProcessStudyWorkerRequest = {
  id: string
  input: ProcessStudyInput
}

export type ProcessStudyWorkerResponse =
  | { id: string; ok: true; result: ProcessStudyOutput }
  | { id: string; ok: false; error: string }

self.onmessage = async (event: MessageEvent<ProcessStudyWorkerRequest>) => {
  const { id, input } = event.data
  try {
    const result = await processStudy(input)
    const transfer: Transferable[] = result.derivatives.map((item) => item.data)
    const response: ProcessStudyWorkerResponse = { id, ok: true, result }
    const ctx = self as unknown as { postMessage: (msg: unknown, t?: Transferable[]) => void }
    ctx.postMessage(response, transfer)
  } catch (error) {
    const response: ProcessStudyWorkerResponse = {
      id,
      ok: false,
      error: error instanceof Error ? error.message : 'No se pudo optimizar el estudio.',
    }
    const ctx = self as unknown as { postMessage: (msg: unknown) => void }
    ctx.postMessage(response)
  }
}
