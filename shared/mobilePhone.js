/**
 * Celular internacional en dígitos E.164.
 * Sin indicativo, se interpreta como Colombia (+57).
 * Los fijos y los números mal formados se rechazan.
 */
import libphonenumber from 'google-libphonenumber'

const { PhoneNumberUtil, PhoneNumberFormat, PhoneNumberType } = libphonenumber
const phoneUtil = PhoneNumberUtil.getInstance()

const DEFAULT_REGION = 'CO'

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

/**
 * @param {string} raw Número con o sin + / 00. Nacional suelto = Colombia.
 * @returns {{ ok: boolean, e164: string, national: string, digits: string, error?: string }}
 */
export function inspectMobile(raw) {
  const input = String(raw ?? '').trim()
  if (!input) return fail('El celular es obligatorio.')

  const digitsOnly = input.replace(/\D/g, '')
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
    if (mobile?.ok) return mobile
  }

  return fail(
    sawFixed
      ? 'Use un número celular, no un teléfono fijo.'
      : 'Ingrese un celular válido. Ejemplo: 300 123 4567.',
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
