import type { RipsTransaction, RipsValidationIssue } from '../types/rips.ts'

/** Consultas, procedimientos y otros servicios que viajan en el JSON RIPS. */
export function ripsPackageServiceCount(rips: Pick<RipsTransaction, 'usuarios'>): number {
  return (rips.usuarios ?? []).reduce((total, usuario) => {
    const servicios = usuario.servicios
    return (
      total +
      (servicios?.consultas?.length ?? 0) +
      (servicios?.procedimientos?.length ?? 0) +
      (servicios?.otrosServicios?.length ?? 0)
    )
  }, 0)
}

/**
 * El paquete se puede exportar cuando hay atenciones, no quedan errores de
 * bloqueo y el JSON incluye al menos un servicio. Las advertencias no bloquean.
 */
export function isRipsPackageReadyForExport(input: {
  sourceCount: number
  issues: Array<Pick<RipsValidationIssue, 'level'>>
  rips: Pick<RipsTransaction, 'usuarios'>
}): boolean {
  if (input.sourceCount <= 0) return false
  if (input.issues.some((issue) => issue.level === 'error')) return false
  if ((input.rips.usuarios ?? []).length === 0) return false
  return ripsPackageServiceCount(input.rips) > 0
}
