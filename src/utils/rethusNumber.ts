import {
  extractRethusDigits,
  isRethusStatusActive,
  normalizeRethusNumber,
  validateRethusNumberFormat,
  VERIFIED_RETHUS_EXAMPLE,
} from '../../shared/rethusNumber.js'

export {
  extractRethusDigits,
  isRethusStatusActive,
  normalizeRethusNumber,
  validateRethusNumberFormat,
  VERIFIED_RETHUS_EXAMPLE,
}

export type RethusStatus = 'activo' | 'inactivo' | 'pendiente'

export function validateActiveRethus(
  rethusNumber: string | null | undefined,
  status?: RethusStatus | null,
): { valid: boolean; message?: string; normalized?: string } {
  const format = validateRethusNumberFormat(rethusNumber)
  if (!format.valid) {
    return { valid: false, message: format.message }
  }
  if (!isRethusStatusActive(status ?? 'activo')) {
    return {
      valid: false,
      normalized: format.normalized,
      message:
        `El RETHUS ${format.normalized} no está activo. El profesional no puede firmar historias clínicas, ` +
        'fórmulas ni soportes de RIPS hasta regularizar su inscripción.',
    }
  }
  return { valid: true, normalized: format.normalized }
}
