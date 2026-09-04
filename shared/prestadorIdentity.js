import { composeLegalName, cleanPersonNamePart } from './personName.js'
import { extractRepsDigits, parseRepsCode } from './repsCode.js'
import { extractNitDigits, validateProviderNit } from './nit.js'
import { extractRethusDigits, normalizeRethusNumber, validateRethusNumberFormat } from './rethusNumber.js'
import { isInstitutionProvider, normalizeProviderType } from './providerType.js'

export function normalizeLegalName(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/^(dr|dra|doctor|doctora)\.?\s+/i, '')
    .replace(/[^a-zA-Z\s]/g, ' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

export function normalizeRazonSocial(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

export function namesCorrespond(left, right) {
  const a = normalizeLegalName(left)
  const b = normalizeLegalName(right)
  if (!a || !b) return false
  if (a === b) return true
  const tokensA = a.split(' ').filter((token) => token.length >= 2)
  const tokensB = b.split(' ').filter((token) => token.length >= 2)
  if (!tokensA.length || !tokensB.length) return false
  const [smaller, larger] = tokensA.length <= tokensB.length ? [tokensA, tokensB] : [tokensB, tokensA]
  return smaller.every((token) =>
    larger.some((other) => other === token || other.startsWith(token) || token.startsWith(other)),
  )
}

export function razonSocialCorresponds(left, right) {
  const a = normalizeRazonSocial(left)
  const b = normalizeRazonSocial(right)
  if (!a || !b) return false
  if (a === b) return true
  const tokensA = a.split(' ').filter((token) => token.length >= 2)
  const tokensB = b.split(' ').filter((token) => token.length >= 2)
  if (!tokensA.length || !tokensB.length) return false
  const [smaller, larger] = tokensA.length <= tokensB.length ? [tokensA, tokensB] : [tokensB, tokensA]
  return smaller.every((token) =>
    larger.some((other) => other === token || other.startsWith(token) || token.startsWith(other)),
  )
}

export function sanitizeRethusInput(value) {
  const raw = String(value ?? '').toUpperCase().replace(/\s+/g, '')
  if (!raw) return ''
  if (raw.startsWith('THS')) {
    const digits = raw.replace(/\D/g, '')
    return digits ? `THS-${digits}` : 'THS-'
  }
  return raw.replace(/\D/g, '')
}

export function sanitizeRepsInput(value) {
  const digits = extractRepsDigits(value)
  if (!digits) return ''
  if (digits.length <= 10) return digits
  return `${digits.slice(0, 10)}-${digits.slice(10, 12)}`
}

export function validatePrestadorIdentityFields(input = {}) {
  const providerType = normalizeProviderType(input.providerType)
  const institution = isInstitutionProvider(providerType)
  const firstName = cleanPersonNamePart(input.firstName)
  const lastName = cleanPersonNamePart(input.lastName)
  const documentNumber = String(input.documentNumber ?? '').replace(/\D/g, '')
  const documentType = String(input.documentType ?? 'CC').trim() || 'CC'
  const clinicName = String(input.clinicName ?? '').trim()
  const legalName = institution
    ? String(input.legalName ?? clinicName ?? '').trim()
    : composeLegalName(firstName, lastName)
  const reps = parseRepsCode(input.repsCode)
  const nit = validateProviderNit(input.providerNit)
  const rethusRaw = String(input.rethusNumber ?? '').trim()
  const rethus = rethusRaw
    ? validateRethusNumberFormat(rethusRaw)
    : { valid: false, message: 'El código ReTHUS es obligatorio para el profesional independiente.' }

  const errors = []
  if (institution) {
    if (!legalName) errors.push('La razón social de la IPS es obligatoria.')
    if (!firstName || !lastName) {
      errors.push('Indique el nombre del representante o responsable de la cuenta.')
    }
  } else {
    if (!firstName) errors.push('Los nombres del profesional son obligatorios, sin títulos (Dr./Dra.).')
    if (!lastName) errors.push('Los apellidos del profesional son obligatorios.')
    if (documentType !== 'PA' && (documentNumber.length < 6 || documentNumber.length > 12)) {
      errors.push('La cédula debe tener entre 6 y 12 dígitos. No se admiten letras.')
    }
    if (documentType === 'PA' && String(input.documentNumber ?? '').replace(/[^A-Z0-9]/gi, '').length < 5) {
      errors.push('Ingrese un pasaporte válido.')
    }
    if (!clinicName && !legalName) errors.push('El nombre del consultorio es obligatorio.')
    if (!rethus.valid) errors.push(rethus.message)
  }

  if (documentNumber && documentType !== 'PA' && (documentNumber.length < 6 || documentNumber.length > 12)) {
    errors.push('La cédula del representante debe tener entre 6 y 12 dígitos.')
  }
  if (rethusRaw && !rethus.valid) errors.push(rethus.message)
  if (!nit.valid) errors.push(nit.message)
  if (!reps.valid) errors.push(reps.message ?? 'El código REPS de la sede es obligatorio.')

  return {
    valid: errors.length === 0,
    errors,
    message: errors[0],
    identity: {
      providerType,
      firstName,
      lastName,
      legalName,
      documentType,
      documentNumber:
        documentType === 'PA'
          ? String(input.documentNumber ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
          : documentNumber,
      clinicName: clinicName || legalName,
      providerNit: nit.digits ?? extractNitDigits(input.providerNit),
      providerNitDisplay: nit.display ?? '',
      repsCode: reps.digits ?? extractRepsDigits(input.repsCode),
      repsDisplay: reps.display ?? '',
      rethusNumber: rethusRaw ? rethus.normalized ?? normalizeRethusNumber(rethusRaw) : '',
      rethusDigits: extractRethusDigits(rethusRaw),
    },
  }
}
