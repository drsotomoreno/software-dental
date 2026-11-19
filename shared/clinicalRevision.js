/**
 * clinicalRevision: contador monotónico de ediciones clínicas del borrador vivo.
 * administrativeUpdatedAt: reloj de RIPS / firmas kiosk / sync admin (no decide hidratación).
 */

function unwrap(record) {
  if (!record || typeof record !== 'object') return {}
  const payload = record.payload
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) return payload
  return record
}

export function clinicalRevisionOf(record) {
  if (!record || typeof record !== 'object') return 0
  const data = unwrap(record)
  const candidates = [
    data.clinicalRevision,
    record.clinicalRevision,
    data.clinicalDraft?.clinicalRevision,
    data.valuationDraft?.clinicalRevision,
  ]
  for (const value of candidates) {
    const n = Number(value)
    if (Number.isFinite(n) && n > 0) return Math.floor(n)
  }
  return 0
}

export function nextClinicalRevision(previous) {
  return clinicalRevisionOf(previous) + 1
}

/**
 * ¿El local pendiente debe protegerse frente a un remoto?
 * pending local o revisión local mayor → no sobrescribir.
 */
export function localDraftBlocksRemoteOverwrite(local, remote) {
  if (!local || typeof local !== 'object') return false
  const status = String(local.syncStatus || unwrap(local).syncStatus || '').toLowerCase()
  if (status === 'pending' || status === 'error') return true
  const localRev = clinicalRevisionOf(local)
  const remoteRev = clinicalRevisionOf(remote)
  if (localRev > 0 && localRev > remoteRev) return true
  return false
}

export function draftSyncStatusOf(record) {
  if (!record || typeof record !== 'object') return ''
  return String(record.syncStatus || unwrap(record).syncStatus || '').toLowerCase()
}
