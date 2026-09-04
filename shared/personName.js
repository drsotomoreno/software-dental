const HONORIFIC_TOKEN = /^(dr|dra|dr\(a\)|doctor|doctora)\.?$/i
const HONORIFIC_PREFIX = /^(?:dr|dra|dr\(a\)|doctor|doctora)\.?(?:\s+|(?=[A-ZÁÉÍÓÚÑ]))/i
const NON_NAME_CHARS = /[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ'\- ]+/g

function looksLikeHonorific(value) {
  return HONORIFIC_TOKEN.test(String(value ?? '').trim())
}

export function stripHonorific(value) {
  return String(value ?? '')
    .trim()
    .replace(HONORIFIC_PREFIX, '')
    .trim()
}

export function cleanPersonNamePart(value) {
  return cleanPersonNameInput(value).trim()
}

/** Limpia títulos y símbolos sin quitar el espacio final, para poder escribir el segundo nombre. */
export function cleanPersonNameInput(value) {
  let text = String(value ?? '').replace(HONORIFIC_PREFIX, '')
  text = text.replace(NON_NAME_CHARS, ' ')
  text = text.replace(/[-']{2,}/g, ' ')
  text = text.replace(/ {2,}/g, ' ')
  text = text.replace(/^\s+/, '')
  if (looksLikeHonorific(text.trim())) return ''
  return text
}

function splitFromFullName(full) {
  const parts = cleanPersonNamePart(full)
    .split(/\s+/)
    .filter(Boolean)
  if (parts.length >= 2) {
    return {
      firstName: parts.slice(0, -1).join(' '),
      lastName: parts[parts.length - 1] ?? '',
    }
  }
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: '' }
  }
  return { firstName: '', lastName: '' }
}

/**
 * Resuelve nombres/apellidos legales.
 * Si hay firstName o lastName, se respetan (trim + limpieza). No rellena el lado vacío
 * con un nombre anterior. Solo parte `nombre` cuando ambos campos estructurados están vacíos.
 */
export function splitPersonName(input = {}) {
  const first = cleanPersonNamePart(input.firstName)
  const last = cleanPersonNamePart(input.lastName)

  if (first && last) {
    return { firstName: first, lastName: last }
  }

  if (first || last) {
    return { firstName: first, lastName: last }
  }

  return splitFromFullName(input.nombre)
}

export function composeLegalName(firstName, lastName) {
  return [cleanPersonNamePart(firstName), cleanPersonNamePart(lastName)].filter(Boolean).join(' ')
}
