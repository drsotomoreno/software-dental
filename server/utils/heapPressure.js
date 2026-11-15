import v8 from 'node:v8'

/**
 * Evita JSON.parse de clinical-sync enorme cuando el heap ya está al límite
 * (t3.micro → FATAL OOM → Nginx 502 en Drive/upload).
 */
export function heapUsedRatio() {
  const limit = Number(v8.getHeapStatistics()?.heap_size_limit) || 0
  if (!limit) return 0
  return process.memoryUsage().heapUsed / limit
}

export function isHeapNearLimit(ratio = 0.7) {
  return heapUsedRatio() >= ratio
}

export function heapPressurePayload(retryAfterSec = 20) {
  const usedMb = Math.round(process.memoryUsage().heapUsed / (1024 * 1024))
  const limitMb = Math.round(
    (Number(v8.getHeapStatistics()?.heap_size_limit) || 0) / (1024 * 1024),
  )
  return {
    success: false,
    ok: false,
    error:
      'El servidor está bajo presión de memoria. Reintente en unos segundos (no se cargó el sync clínico).',
    code: 'HEAP_PRESSURE',
    retryAfterSec,
    heapUsedMb: usedMb,
    heapLimitMb: limitMb,
  }
}
