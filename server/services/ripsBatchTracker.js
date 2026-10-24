/**
 * Resultado del lote diario mientras el proceso de Node sigue vivo.
 * El POST responde 202; el navegador consulta este estado para guardar el CUV.
 * Cada lote solo lo lee el prestador que lo envió.
 */

const MAX_LOTES = 40

function vista(lote) {
  const items = lote.items
    .filter((item) => !item.pending)
    .map(({ pending: _pending, ...item }) => item)
  return {
    batchId: lote.batchId,
    status: lote.status,
    count: lote.count,
    completed: items.length,
    items,
  }
}

function rechazoPendiente(message) {
  return {
    success: false,
    cuv: null,
    retryable: true,
    errors: [
      {
        code: 'RIPS_BATCH_INCOMPLETO',
        message: message || 'El lote terminó sin respuesta de este RIPS.',
        path: '',
      },
    ],
  }
}

export function createRipsBatchTracker() {
  /** @type {Map<string, object>} */
  const lotes = new Map()

  function podar() {
    if (lotes.size < MAX_LOTES) return
    const ranked = [...lotes.entries()].sort((left, right) => left[1].createdAt - right[1].createdAt)
    for (const [id, lote] of ranked) {
      if (lotes.size < MAX_LOTES - 10) break
      if (lote.status === 'done') lotes.delete(id)
    }
  }

  function abrir(batchId, sobres, userId) {
    podar()
    const items = (Array.isArray(sobres) ? sobres : []).map((sobre) => ({
      evolutionId: sobre.evolutionId ?? null,
      patientId: sobre.patientId ?? null,
      success: false,
      cuv: null,
      retryable: false,
      errors: [],
      pending: true,
    }))
    lotes.set(batchId, {
      batchId,
      userId: String(userId ?? ''),
      status: 'processing',
      count: items.length,
      items,
      createdAt: Date.now(),
    })
  }

  function anotar(batchId, item) {
    const lote = lotes.get(batchId)
    if (!lote || lote.status === 'done') return
    const index = lote.items.findIndex(
      (row) => row.pending && row.evolutionId === (item.evolutionId ?? null),
    )
    const next = {
      evolutionId: item.evolutionId ?? null,
      patientId: item.patientId ?? null,
      success: item.success === true && Boolean(String(item.cuv ?? '').trim()),
      cuv: item.success === true ? String(item.cuv ?? '').trim() || null : null,
      retryable: item.retryable === true,
      errors: Array.isArray(item.errors) ? item.errors : [],
      pending: false,
    }
    if (index >= 0) lote.items[index] = next
    else lote.items.push(next)
  }

  function cerrar(batchId, message) {
    const lote = lotes.get(batchId)
    if (!lote || lote.status === 'done') return
    for (const item of lote.items) {
      if (!item.pending) continue
      Object.assign(item, rechazoPendiente(message), { pending: false, evolutionId: item.evolutionId, patientId: item.patientId })
    }
    lote.status = 'done'
  }

  function obtener(batchId, userId) {
    const lote = lotes.get(String(batchId ?? ''))
    if (!lote) return null
    if (lote.userId !== String(userId ?? '')) return null
    return vista(lote)
  }

  return { abrir, anotar, cerrar, obtener }
}

export const ripsBatchTracker = createRipsBatchTracker()
