/**
 * Celular internacional en dígitos E.164.
 * Sin indicativo, se interpreta como Colombia (+57).
 * Los fijos, mal formados y patrones falsos evidentes se rechazan.
 */
import libphonenumber from 'google-libphonenumber'

const { PhoneNumberUtil, PhoneNumberFormat, PhoneNumberType } = libphonenumber
const phoneUtil = PhoneNumberUtil.getInstance()

const DEFAULT_REGION = 'CO'

/** Mensaje único para longitud inválida o patrones inventados evidentes. */
export const FAKE_OR_INVALID_MOBILE_ERROR = 'Ingresa un número de celular real y válido.'

function fail(error) {
  return { ok: false, e164: '', national: '', digits: '', error }
}

function asMobile(parsed) {
  if (!parsed || !phoneUtil.isValidNumber(parsed)) return null
  const numberType = phoneUtil.getNumberType(parsed)
  const isMobile =
    numberType === PhoneNumberType.MOBILE ||
    numberType === PhoneNumberType.FIXED_LINE_OR_MOBILE
  if (!isMobile) return 'fixed'
  const e164 = phoneUtil.format(parsed, PhoneNumberFormat.E164)
  const digits = e164.replace(/\D/g, '')
  if (digits.length < 8 || digits.length > 15) return null
  return {
    ok: true,
    e164,
    national: phoneUtil.format(parsed, PhoneNumberFormat.NATIONAL),
    digits,
  }
}

function hasLongSequentialRun(digits, minLen = 6) {
  const s = String(digits || '')
  if (s.length < minLen) return false
  let ascending = 1
  let descending = 1
  for (let i = 1; i < s.length; i += 1) {
    const delta = Number(s[i]) - Number(s[i - 1])
    if (delta === 1) {
      ascending += 1
      descending = 1
    } else if (delta === -1) {
      descending += 1
      ascending = 1
    } else {
      ascending = 1
      descending = 1
    }
    if (ascending >= minLen || descending >= minLen) return true
  }
  return false
}

/**
 * Patrones inventados evidentes (repetidos, secuencias tipo 3123456789 / 3001234567,
 * longitud fuera de E.164). No envía nada a WhatsApp: solo heurística local.
 *
 * @param {string} raw
 * @returns {boolean}
 */
function hasHeavyDigitRepetition(digits) {
  const value = String(digits || '')
  if (!value) return true
  if (/^(\d)\1+$/.test(value)) return true
  const counts = new Map()
  for (const ch of value) {
    counts.set(ch, (counts.get(ch) || 0) + 1)
  }
  for (const count of counts.values()) {
    if (count >= 7) return true
  }
  // Pocos dígitos distintos en un celular de 10 (ej. 3000000000, 3111111111).
  if (value.length >= 10 && counts.size <= 2) return true
  return false
}

export function looksLikeFakeMobileDigits(raw) {
  const value = String(raw ?? '').replace(/\D/g, '')
  if (!value) return true
  if (value.length < 8 || value.length > 15) return true
  if (hasHeavyDigitRepetition(value)) return true

  const coLocal = colombiaLocal(value)
  if (coLocal) {
    if (hasHeavyDigitRepetition(coLocal)) return true
    if (hasLongSequentialRun(coLocal, 6)) return true
  }

  return false
}

/**
 * @param {string} raw Número con o sin + / 00. Nacional suelto = Colombia.
 * @returns {{ ok: boolean, e164: string, national: string, digits: string, error?: string }}
 */
export function inspectMobile(raw) {
  const input = String(raw ?? '').trim()
  if (!input) return fail('El celular es obligatorio.')

  const digitsOnly = input.replace(/\D/g, '')
  if (digitsOnly && looksLikeFakeMobileDigits(digitsOnly)) {
    return fail(FAKE_OR_INVALID_MOBILE_ERROR)
  }

  const candidates = []
  if (input.startsWith('+')) candidates.push(input)
  else if (input.startsWith('00') && digitsOnly.length > 4) {
    candidates.push(`+${digitsOnly.replace(/^00/, '')}`)
  } else if (digitsOnly.length > 10) candidates.push(`+${digitsOnly}`)
  candidates.push(input)

  let sawFixed = false
  const seen = new Set()
  for (const candidate of candidates) {
    if (!candidate || seen.has(candidate)) continue
    seen.add(candidate)
    let parsed = null
    try {
      parsed = phoneUtil.parseAndKeepRawInput(candidate, DEFAULT_REGION)
    } catch {
      parsed = null
    }
    const mobile = asMobile(parsed)
    if (mobile === 'fixed') {
      sawFixed = true
      continue
    }
    if (mobile?.ok) {
      if (looksLikeFakeMobileDigits(mobile.digits)) {
        return fail(FAKE_OR_INVALID_MOBILE_ERROR)
      }
      return mobile
    }
  }

  return fail(
    sawFixed
      ? 'Use un número celular, no un teléfono fijo.'
      : FAKE_OR_INVALID_MOBILE_ERROR,
  )
}

/** Dígitos E.164 (sin +) o cadena vacía si no es un celular válido. */
export function normalizeMobileDigits(raw) {
  const result = inspectMobile(raw)
  return result.ok ? result.digits : ''
}

function colombiaLocal(digits) {
  const value = String(digits || '').replace(/\D/g, '')
  if (value.startsWith('57') && value.length === 12 && value[2] === '3') return value.slice(2)
  if (value.length === 10 && value.startsWith('3')) return value
  return ''
}

/**
 * Coincide el E.164 completo.
 * En Colombia también acepta los 10 dígitos locales (con o sin 57).
 */
export function mobileDigitsMatch(left, right) {
  const a = String(left ?? '').replace(/\D/g, '')
  const b = String(right ?? '').replace(/\D/g, '')
  if (!a || !b) return false
  if (a === b) return true
  const localA = colombiaLocal(a)
  const localB = colombiaLocal(b)
  if (localA && localB && localA === localB) return true
  if (localA && b === localA) return true
  if (localB && a === localB) return true
  return false
}
