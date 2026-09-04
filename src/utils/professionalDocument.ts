/** Etiqueta oficial: la cédula es la llave de consulta en ReTHUS / SISPRO. */
export const PROFESSIONAL_DOCUMENT_LABEL = 'Número de Documento (Cédula / ReTHUS)'

export const PROFESSIONAL_DOCUMENT_TYPES = [
  { value: 'CC', label: 'Cédula de Ciudadanía' },
  { value: 'CE', label: 'Cédula de Extranjería' },
  { value: 'PA', label: 'Pasaporte' },
  { value: 'TI', label: 'Tarjeta de Identidad' },
] as const

export function professionalDocumentNumber(
  user: { documentNumber?: string | null } | null | undefined,
): string {
  return user?.documentNumber?.trim() ?? ''
}

export function sanitizeDocumentNumber(
  documentNumber: string | null | undefined,
  documentType = 'CC',
): string {
  const raw = String(documentNumber ?? '')
  if (documentType === 'PA') {
    return raw.toUpperCase().replace(/[^A-Z0-9]/g, '')
  }
  return raw.replace(/\D/g, '')
}

export function validateProfessionalDocumentNumber(
  documentNumber: string | null | undefined,
  documentType = 'CC',
): { valid: boolean; message?: string; normalized?: string } {
  const normalized = sanitizeDocumentNumber(documentNumber, documentType)
  if (!normalized) {
    return {
      valid: false,
      message:
        'El número de documento (cédula) es obligatorio. Es la llave de consulta en ReTHUS y el sistema nacional de salud.',
    }
  }
  if (documentType === 'PA') {
    if (normalized.length < 5 || normalized.length > 20) {
      return { valid: false, message: 'Ingrese un pasaporte válido.' }
    }
    return { valid: true, normalized }
  }
  if (normalized.length < 6 || normalized.length > 12) {
    return {
      valid: false,
      message: 'La cédula debe tener entre 6 y 12 dígitos. No se admiten letras.',
    }
  }
  return { valid: true, normalized }
}
