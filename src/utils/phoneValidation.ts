import libphonenumber from 'google-libphonenumber'

const { PhoneNumberUtil, PhoneNumberFormat, PhoneNumberType } = libphonenumber
const phoneUtil = PhoneNumberUtil.getInstance()

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
 * Valida un celular de Colombia (+57) para registro express / WhatsApp.
 * Acepta entradas con o sin indicativo (p. ej. 3001234567, +57 300 123 4567).
 */
export function validateColombiaMobile(raw: string): ColombiaMobileValidation {
  const input = String(raw ?? '').trim()
  if (!input) {
    return { ok: false, e164: '', national: '', digits: '', error: 'El celular es obligatorio.' }
  }

  try {
    const parsed = phoneUtil.parseAndKeepRawInput(input, COLOMBIA_REGION)
    if (!phoneUtil.isValidNumberForRegion(parsed, COLOMBIA_REGION)) {
      return {
        ok: false,
        e164: '',
        national: '',
        digits: '',
        error: 'Ingrese un celular colombiano válido (+57).',
      }
    }

    const numberType = phoneUtil.getNumberType(parsed)
    const isMobile =
      numberType === PhoneNumberType.MOBILE ||
      numberType === PhoneNumberType.FIXED_LINE_OR_MOBILE

    if (!isMobile) {
      return {
        ok: false,
        e164: '',
        national: '',
        digits: '',
        error: 'Use un número celular (no fijo) de Colombia.',
      }
    }

    const e164 = phoneUtil.format(parsed, PhoneNumberFormat.E164)
    const national = phoneUtil.format(parsed, PhoneNumberFormat.NATIONAL)
    const digits = e164.replace(/\D/g, '')

    if (!digits.startsWith(String(COLOMBIA_COUNTRY_CODE)) || digits.length < 12) {
      return {
        ok: false,
        e164: '',
        national: '',
        digits: '',
        error: 'El celular debe incluir indicativo +57 y 10 dígitos.',
      }
    }

    return { ok: true, e164, national, digits }
  } catch {
    return {
      ok: false,
      e164: '',
      national: '',
      digits: '',
      error: 'Formato de celular inválido. Ejemplo: 300 123 4567',
    }
  }
}

/** Normaliza a dígitos internacionales (57XXXXXXXXXX) si el número es válido. */
export function normalizeColombiaMobileDigits(raw: string): string | null {
  const result = validateColombiaMobile(raw)
  return result.ok ? result.digits : null
}
