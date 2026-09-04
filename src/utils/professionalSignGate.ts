import type { UserProfile } from '@/types/user'
import { validateProfessionalDocumentNumber } from '@/utils/professionalDocument'

/**
 * El profesional asociado a la atención debe tener cédula (llave ReTHUS)
 * para firmar fórmulas, historias clínicas y soportes de RIPS.
 */
export function getProfessionalSignBlocker(
  professional: Pick<UserProfile, 'documentNumber' | 'role'> | null | undefined,
): string | null {
  if (!professional) {
    return 'No hay un profesional autenticado para firmar.'
  }
  if (professional.role === 'recepcion') {
    return 'El personal de recepción no puede firmar historias clínicas ni soportes de RIPS.'
  }
  const result = validateProfessionalDocumentNumber(professional.documentNumber)
  return result.valid ? null : (result.message ?? 'Falta el número de documento (cédula / ReTHUS).')
}

export function professionalCanSignClinicalDocuments(
  professional: Pick<UserProfile, 'documentNumber' | 'role'> | null | undefined,
): boolean {
  return getProfessionalSignBlocker(professional) === null
}
