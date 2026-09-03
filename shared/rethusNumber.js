/**
 * RETHUS — Registro Único Nacional del Talento Humano en Salud.
 * Número consecutivo nacional otorgado por el Ministerio de Salud.
 * Ejemplo verificado: 438265 (odontólogo).
 */

export const VERIFIED_RETHUS_EXAMPLE = '438265'

export function normalizeRethusNumber(value) {
  return String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
}

export function extractRethusDigits(value) {
  return String(value ?? '').replace(/\D/g, '')
}

/**
 * Acepta el consecutivo oficial (6–12 dígitos) o el prefijo THS- del directorio de prueba.
 */
export function validateRethusNumberFormat(value) {
  const normalized = normalizeRethusNumber(value)
  if (!normalized) {
    return {
      valid: false,
      message: 'El número RETHUS del profesional tratante es obligatorio.',
    }
  }

  const digits = extractRethusDigits(normalized)
  if (digits.length < 6 || digits.length > 12) {
    return {
      valid: false,
      normalized,
      digits,
      message:
        `El número RETHUS debe ser un consecutivo nacional de 6 a 12 dígitos (ej. ${VERIFIED_RETHUS_EXAMPLE}).`,
    }
  }

  return { valid: true, normalized, digits }
}

export function isRethusStatusActive(status) {
  if (!status) return true
  return String(status).trim().toLowerCase() === 'activo'
}
