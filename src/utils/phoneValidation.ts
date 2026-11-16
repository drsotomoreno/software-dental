import { inspectMobile } from '../../shared/mobilePhone.js'

export const COLOMBIA_REGION = 'CO'
export const COLOMBIA_COUNTRY_CODE = 57

export type ColombiaMobileValidation = {
  ok: boolean
  e164: string
  national: string
  digits: string
  error?: string
}

/**
 * Celular internacional (E.164). Sin indicativo se asume Colombia (+57).
 * Rechaza fijos y números mal formados. El valor `digits` no incluye el «+».
 */
export function validateInternationalMobile(raw: string): ColombiaMobileValidation {
  const result = inspectMobile(raw)
  return {
    ok: Boolean(result.ok),
    e164: result.e164 || '',
    national: result.national || '',
    digits: result.digits || '',
    error: result.error,
  }
}

/** @deprecated Usar validateInternationalMobile. Conserva el nombre de los imports. */
export function validateColombiaMobile(raw: string): ColombiaMobileValidation {
  return validateInternationalMobile(raw)
}

/** Dígitos internacionales si el número es un celular válido. */
export function normalizeColombiaMobileDigits(raw: string): string | null {
  const result = validateInternationalMobile(raw)
  return result.ok ? result.digits : null
}
