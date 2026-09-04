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

export function validateProfessionalDocumentNumber(
  documentNumber: string | null | undefined,
): { valid: boolean; message?: string; normalized?: string } {
  const normalized = String(documentNumber ?? '')
    .trim()
    .replace(/[.\s-]/g, '')
  if (!normalized) {
    return {
      valid: false,
      message:
        'El número de documento (cédula) es obligatorio. Es la llave de consulta en ReTHUS y el sistema nacional de salud.',
    }
  }
  if (normalized.length < 5 || normalized.length > 20) {
    return {
      valid: false,
      message: 'Ingrese un número de documento válido (cédula / ReTHUS).',
    }
  }
  return { valid: true, normalized }
}
