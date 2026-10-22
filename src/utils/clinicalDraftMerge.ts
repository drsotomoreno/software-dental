/** Marca de tiempo de un borrador. Una fecha ausente o inválida vale 0. */
export function clinicalDraftStamp(updatedAt: string | null | undefined): number {
  const stamp = Date.parse(String(updatedAt || ''))
  return Number.isFinite(stamp) ? stamp : 0
}

/**
 * El borrador remoto solo debe reemplazar al local si su `updatedAt` es
 * estrictamente posterior. Misma fecha o local más nuevo: se conserva el local.
 */
export function isRemoteDraftNewer(
  localUpdatedAt: string | null | undefined,
  remoteUpdatedAt: string | null | undefined,
): boolean {
  return clinicalDraftStamp(remoteUpdatedAt) > clinicalDraftStamp(localUpdatedAt)
}
