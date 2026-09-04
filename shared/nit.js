/** Pesos DIAN para dígito de verificación del NIT, de derecha a izquierda. */
const NIT_WEIGHTS = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71]

export function extractNitDigits(value) {
  return String(value ?? '').replace(/\D/g, '')
}

export function computeNitDv(nitWithoutDv) {
  const digits = extractNitDigits(nitWithoutDv)
    .split('')
    .map(Number)
    .reverse()
  const sum = digits.reduce((acc, digit, index) => acc + digit * (NIT_WEIGHTS[index] ?? 0), 0)
  const remainder = sum % 11
  return remainder > 1 ? 11 - remainder : remainder
}

export function formatNitInput(value) {
  const digits = extractNitDigits(value)
  if (!digits) return ''
  // 8–10 dígitos de documento + DV (cédula antigua, NIT de 9 o cédula de 10).
  if (digits.length < 9) return digits
  return `${digits.slice(0, -1)}-${digits.slice(-1)}`
}

export function validateProviderNit(value) {
  const digits = extractNitDigits(value)
  if (!digits) {
    return { valid: false, message: 'El NIT fiscal (DIAN) es obligatorio para identificar al prestador.' }
  }
  // Persona natural: cédula de 8 dígitos + DV (ej. 79904620-4). Persona jurídica o cédula de 9–10 + DV.
  if (digits.length < 9 || digits.length > 11) {
    return {
      valid: false,
      message:
        'Ingrese el NIT o cédula con dígito de verificación (8 a 10 dígitos + DV). Ejemplo de cédula antigua: 79904620-4.',
    }
  }
  const body = digits.slice(0, -1)
  const dv = Number(digits.slice(-1))
  const expected = computeNitDv(body)
  if (Number.isNaN(dv) || dv !== expected) {
    return {
      valid: false,
      digits,
      body,
      expectedDv: expected,
      message: `El dígito de verificación del NIT no es válido. Para ${body} el DV es ${expected}.`,
    }
  }
  return {
    valid: true,
    digits,
    body,
    dv,
    display: `${body}-${dv}`,
  }
}
