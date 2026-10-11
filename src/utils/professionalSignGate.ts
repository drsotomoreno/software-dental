import type { UserProfile } from '@/types/user'
import {
  firstValidProfessionalDocument,
  professionalDocumentCandidatesForSigner,
  validateProfessionalDocumentNumber,
} from '@/utils/professionalDocument'

type SigningProfessional = Pick<UserProfile, 'documentNumber' | 'role'> & {
  id?: string
  email?: string
  documentType?: string
}

/**
 * Cédula con la que se puede firmar: la del perfil, o la que ya quedó
 * en el consentimiento y las evoluciones de esta atención.
 */
export function resolveSignerDocumentNumber(
  professional: SigningProfessional | null | undefined,
  clinical?: unknown,
): string {
  if (!professional) return ''
  return firstValidProfessionalDocument(
    [
      professional.documentNumber,
      ...professionalDocumentCandidatesForSigner(clinical, professional),
    ],
    professional.documentType || 'CC',
  )
}

/**
 * El profesional asociado a la atención debe tener cédula (llave ReTHUS)
 * para firmar fórmulas, historias clínicas y soportes de RIPS.
 */
export function getProfessionalSignBlocker(
  professional: SigningProfessional | null | undefined,
  clinical?: unknown,
): string | null {
  if (!professional) {
    return 'No hay un profesional autenticado para firmar.'
  }
  if (professional.role === 'recepcion') {
    return 'El personal de recepción no puede firmar historias clínicas ni soportes de RIPS.'
  }
  const result = validateProfessionalDocumentNumber(
    resolveSignerDocumentNumber(professional, clinical),
    professional.documentType || 'CC',
  )
  return result.valid ? null : (result.message ?? 'Falta el número de documento (cédula / ReTHUS).')
}

export function professionalCanSignClinicalDocuments(
  professional: SigningProfessional | null | undefined,
  clinical?: unknown,
): boolean {
  return getProfessionalSignBlocker(professional, clinical) === null
}
