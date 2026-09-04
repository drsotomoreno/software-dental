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
    ? String(input.legalName ?? '').trim()
    : composeLegalName(firstName, lastName)
  const reps = parseRepsCode(input.repsCode)
  const nit = validateProviderNit(input.providerNit)
  const rethusRaw = String(input.rethusNumber ?? '').trim()
  const rethus = rethusRaw
    ? validateRethusNumberFormat(rethusRaw)
    : { valid: false, message: 'El código ReTHUS es obligatorio para el profesional independiente.' }

  const errors = []
  const fieldErrors = {}
  const addError = (field, message) => {
    errors.push(message)
    if (field && !fieldErrors[field]) fieldErrors[field] = message
  }

  if (institution) {
    if (!legalName) addError('legalName', 'La razón social de la IPS es obligatoria.')
    if (!firstName || !lastName) {
      addError(
        !firstName ? 'firstName' : 'lastName',
        'Indique el nombre del representante o responsable de la cuenta.',
      )
      if (!firstName) fieldErrors.firstName = fieldErrors.firstName || 'Los nombres del representante son obligatorios.'
      if (!lastName) fieldErrors.lastName = fieldErrors.lastName || 'Los apellidos del representante son obligatorios.'
    }
  } else {
    if (!firstName) addError('firstName', 'Los nombres del profesional son obligatorios, sin títulos (Dr./Dra.).')
    if (!lastName) addError('lastName', 'Los apellidos del profesional son obligatorios.')
    if (documentType !== 'PA' && (documentNumber.length < 6 || documentNumber.length > 12)) {
      addError('documentNumber', 'La cédula debe tener entre 6 y 12 dígitos. No se admiten letras.')
    }
    if (documentType === 'PA' && String(input.documentNumber ?? '').replace(/[^A-Z0-9]/gi, '').length < 5) {
      addError('documentNumber', 'Ingrese un pasaporte válido.')
    }
    if (!clinicName && !legalName) addError('clinicName', 'El nombre del consultorio es obligatorio.')
    if (!rethus.valid) addError('rethusNumber', rethus.message)
  }

  if (documentNumber && documentType !== 'PA' && (documentNumber.length < 6 || documentNumber.length > 12)) {
    addError('documentNumber', 'La cédula del representante debe tener entre 6 y 12 dígitos.')
  }
  if (rethusRaw && !rethus.valid) addError('rethusNumber', rethus.message)
  if (!nit.valid) addError('providerNit', nit.message)
  if (!reps.valid) addError('repsCode', reps.message ?? 'El código REPS de la sede es obligatorio.')

  return {
    valid: errors.length === 0,
    errors,
    fieldErrors,
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
      clinicName: clinicName || (institution ? legalName : ''),
      providerNit: nit.digits ?? extractNitDigits(input.providerNit),
      providerNitDisplay: nit.display ?? '',
      repsCode: reps.digits ?? extractRepsDigits(input.repsCode),
      repsDisplay: reps.display ?? '',
      rethusNumber: rethusRaw ? rethus.normalized ?? normalizeRethusNumber(rethusRaw) : '',
      rethusDigits: extractRethusDigits(rethusRaw),
    },
  }
}
