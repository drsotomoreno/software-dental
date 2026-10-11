/** Etiqueta oficial: la cédula es la llave de consulta en ReTHUS / SISPRO. */
export const PROFESSIONAL_DOCUMENT_LABEL = 'Número de Documento (Cédula / ReTHUS)'

export const PROFESSIONAL_DOCUMENT_TYPES = [
  { value: 'CC', label: 'Cédula de Ciudadanía' },
  { value: 'CE', label: 'Cédula de Extranjería' },
  { value: 'PA', label: 'Pasaporte' },
  { value: 'TI', label: 'Tarjeta de Identidad' },
] as const

export {
  dominantProfessionalDocument,
  firstValidProfessionalDocument,
  keepStoredDocumentNumber,
  professionalDocumentCandidatesForSigner,
  sanitizeDocumentNumber,
  validateProfessionalDocumentNumber,
} from '../../shared/professionalDocument.js'

export function professionalDocumentNumber(
  user: { documentNumber?: string | null } | null | undefined,
): string {
  return user?.documentNumber?.trim() ?? ''
}
