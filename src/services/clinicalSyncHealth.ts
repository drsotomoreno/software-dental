/**
 * Salud del último pull clínico (multi-tenant).
 * Evita que una lista vacía se confunda con “no hay pacientes” cuando el sync falló.
 */

export type ClinicalSyncHealthStatus =
  | 'unknown'
  | 'ok'
  | 'failed'
  | 'empty_ok'
  | 'meta_missing'

export type ClinicalSyncHealth = {
  status: ClinicalSyncHealthStatus
  at: string
  clinicId?: string
  patientCount?: number
  error?: string
  code?: string
}

const STORAGE_KEY = 'mhd_clinical_sync_health'
const listeners = new Set<() => void>()

function readStored(): ClinicalSyncHealth {
  if (typeof window === 'undefined') {
    return { status: 'unknown', at: new Date().toISOString() }
  }
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return { status: 'unknown', at: new Date().toISOString() }
    return JSON.parse(raw) as ClinicalSyncHealth
  } catch {
    return { status: 'unknown', at: new Date().toISOString() }
  }
}

let current: ClinicalSyncHealth = readStored()

export function getClinicalSyncHealth(): ClinicalSyncHealth {
  return current
}

export function subscribeClinicalSyncHealth(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function emit() {
  for (const listener of listeners) {
    try {
      listener()
    } catch {
      /* ignore */
    }
  }
}

export function setClinicalSyncHealth(update: Omit<ClinicalSyncHealth, 'at'> & { at?: string }) {
  current = {
    ...update,
    at: update.at || new Date().toISOString(),
  }
  if (typeof window !== 'undefined') {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(current))
    } catch {
      /* ignore */
    }
  }
  emit()
}

export function recordPullSuccess(clinicId: string, patientCount: number) {
  setClinicalSyncHealth({
    status: patientCount > 0 ? 'ok' : 'empty_ok',
    clinicId,
    patientCount,
  })
}

export function recordPullFailure(clinicId: string, error?: string, code?: string) {
  const metaMissing = code === 'SYNC_META_MISSING' || /meta/i.test(String(error || ''))
  setClinicalSyncHealth({
    status: metaMissing ? 'meta_missing' : 'failed',
    clinicId,
    error: error || 'No se pudo sincronizar la clínica',
    code,
  })
}

/** ¿La lista vacía puede ser un fallo de sync y no una clínica sin pacientes? */
export function emptyListLooksLikeSyncFailure(health = current): boolean {
  return health.status === 'failed' || health.status === 'meta_missing'
}
