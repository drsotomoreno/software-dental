import type { ClinicalRecord } from '@/types/clinicalRecord'
import type { Patient } from '@/types/patient'
import type { UserProfile } from '@/types/user'
import { buildRipsPackageFromEncounter } from '@/utils/ripsEncounter'
import { buildDefaultRipsMetadata } from '@/utils/rips'
import { transmitirRipsDeLaSesion } from '@/services/ripsApiService'

function mensajeError(error: unknown) {
  if (typeof error === 'string' && error.trim()) return error
  if (error && typeof error === 'object') {
    const record = error as { mensaje?: string; message?: string }
    return record.mensaje || record.message || 'el Ministerio no aceptó el paquete.'
  }
  return 'el Ministerio no aceptó el paquete.'
}

/**
 * Tras cerrar la historia, envía el RIPS con el prestador de la sesión activa.
 */
export async function enviarHistoriaCerradaAlMinisterio(
  record: ClinicalRecord,
  patient: Patient,
  professional: UserProfile,
): Promise<string> {
  const pack = buildRipsPackageFromEncounter(
    record,
    patient,
    professional,
    buildDefaultRipsMetadata(professional),
  )
  const blocking = pack.result.issues.filter((issue) => issue.level === 'error')
  if (blocking.length > 0) {
    return ` El envío al Ministerio quedó pendiente: ${blocking[0]?.message ?? 'el RIPS no está completo.'}`
  }

  try {
    const resultado = await transmitirRipsDeLaSesion(pack.result.rips)
    if (resultado.success) {
      return ` ${resultado.mensaje ?? 'Enviado al Ministerio con el prestador de esta sesión.'}`
    }
    return ` No se transmitió al Ministerio: ${mensajeError(resultado.error)}`
  } catch {
    return ' No se pudo contactar al Ministerio para transmitir el RIPS.'
  }
}
