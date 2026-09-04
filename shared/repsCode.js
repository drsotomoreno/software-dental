/**
 * Código REPS de habilitación de sede (prestador).
 * Estructura: [Depto 2][Municipio 3][Consecutivo IPS/PI 5]-[Sede 2]
 * Ejemplo verificado: 6800103898-01 (Santander / Bucaramanga / sede principal).
 * En RIPS/XML se transmite como 12 dígitos sin guion: 680010389801.
 */

export const REPS_DIGITS_PATTERN = /^\d{12}$/
export const REPS_DISPLAY_PATTERN = /^(\d{10})-(\d{2})$/
export const VERIFIED_REPS_EXAMPLE_DISPLAY = '6800103898-01'
export const VERIFIED_REPS_EXAMPLE_DIGITS = '680010389801'

export function extractRepsDigits(value) {
  return String(value ?? '').replace(/\D/g, '')
}

/**
 * 12 dígitos para encabezado XML FEV y JSON RIPS (codPrestador).
 * No rellena con ceros códigos incompletos.
 */
export function normalizeRepsCode(value) {
  const digits = extractRepsDigits(value)
  return digits.length === 12 ? digits : digits
}

export function formatRepsCodeDisplay(value) {
  const digits = extractRepsDigits(value)
  if (digits.length !== 12) return String(value ?? '').trim()
  return `${digits.slice(0, 10)}-${digits.slice(10)}`
}

export function parseRepsCode(value) {
  const raw = String(value ?? '').trim()
  const digits = extractRepsDigits(raw)

  if (!digits) {
    return {
      valid: false,
      digits: '',
      message: 'El código REPS de habilitación de la sede es obligatorio.',
    }
  }

  if (digits.length !== 12) {
    return {
      valid: false,
      digits,
      message:
        `El código REPS debe tener 12 dígitos con formato [depto 2][municipio 3][consecutivo 5]-[sede 2] ` +
        `(ej. ${VERIFIED_REPS_EXAMPLE_DISPLAY}). Recibido: ${digits.length} dígito(s).`,
    }
  }

  const departmentCode = digits.slice(0, 2)
  const municipalitySuffix = digits.slice(2, 5)
  const daneMunicipality = digits.slice(0, 5)
  const consecutive = digits.slice(5, 10)
  const sedeCode = digits.slice(10, 12)

  return {
    valid: true,
    digits,
    display: `${digits.slice(0, 10)}-${sedeCode}`,
    departmentCode,
    municipalitySuffix,
    daneMunicipality,
    consecutive,
    sedeCode,
    isMainSede: sedeCode === '01',
  }
}

export function validateRepsCodeStructure(value) {
  const parsed = parseRepsCode(value)
  if (!parsed.valid) {
    return { valid: false, message: parsed.message }
  }
  return { valid: true, parsed }
}
