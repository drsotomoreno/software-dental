/** Cédula del profesional: llave de consulta en ReTHUS / SISPRO. */

export function sanitizeDocumentNumber(documentNumber, documentType = 'CC') {
  const raw = String(documentNumber ?? '')
  if (documentType === 'PA') {
    return raw.toUpperCase().replace(/[^A-Z0-9]/g, '')
  }
  return raw.replace(/\D/g, '')
}

export function validateProfessionalDocumentNumber(documentNumber, documentType = 'CC') {
  const normalized = sanitizeDocumentNumber(documentNumber, documentType)
  if (!normalized) {
    return {
      valid: false,
      message:
        'El número de documento (cédula) es obligatorio. Es la llave de consulta en ReTHUS y el sistema nacional de salud.',
    }
  }
  if (documentType === 'PA') {
    if (normalized.length < 5 || normalized.length > 20) {
      return { valid: false, message: 'Ingrese un pasaporte válido.' }
    }
    return { valid: true, normalized }
  }
  if (normalized.length < 6 || normalized.length > 12) {
    return {
      valid: false,
      message: 'La cédula debe tener entre 6 y 12 dígitos. No se admiten letras.',
    }
  }
  return { valid: true, normalized }
}

function emailsMatch(left, right) {
  const a = String(left ?? '').trim().toLowerCase()
  const b = String(right ?? '').trim().toLowerCase()
  return Boolean(a && b && a === b)
}

/**
 * Cédulas ya escritas en la atención (consentimiento y evoluciones).
 * No incluye el documento del paciente: no es la llave ReTHUS del profesional.
 * Una nota de otro profesional no aporta ni habilita el consentimiento.
 * Si el correo del autor coincide, la nota es de quien firma aunque el id local
 * no sea el id de la cuenta en el servidor.
 */
export function professionalDocumentCandidatesForSigner(clinical, signer) {
  if (!clinical || typeof clinical !== 'object') return []
  const notes = Array.isArray(clinical.evolutionNotes) ? clinical.evolutionNotes : []
  const signerEmail = signer?.email
  const signerId = signer?.id
  const candidates = []
  let foreign = false

  for (const note of notes) {
    if (!note || typeof note !== 'object') continue
    const authorEmail = note.authorEmail
    const authorId = note.authorUserId
    const emailConflicts = Boolean(authorEmail && signerEmail && !emailsMatch(authorEmail, signerEmail))
    const idConflicts =
      !authorEmail && Boolean(authorId && signerId && String(authorId) !== String(signerId))
    if (emailConflicts || idConflicts) {
      foreign = true
      continue
    }
    candidates.push(note.professionalLicense)
  }

  if (!foreign) {
    const consent = clinical.informedConsent
    if (consent && typeof consent === 'object') {
      candidates.push(consent.professionalLicense, consent.professionalRegistry)
    }
  }

  return candidates
}

export function firstValidProfessionalDocument(candidates, documentType = 'CC') {
  const list = Array.isArray(candidates) ? candidates : []
  for (const candidate of list) {
    const result = validateProfessionalDocumentNumber(candidate, documentType)
    if (result.valid && result.normalized) return result.normalized
  }
  return ''
}

/** Una sola cédula repetida en la clínica. Si hay más de una, no se adivina. */
export function dominantProfessionalDocument(candidates, documentType = 'CC') {
  const counts = new Map()
  const list = Array.isArray(candidates) ? candidates : []
  for (const candidate of list) {
    const result = validateProfessionalDocumentNumber(candidate, documentType)
    if (!result.valid || !result.normalized) continue
    counts.set(result.normalized, (counts.get(result.normalized) ?? 0) + 1)
  }
  if (counts.size !== 1) return ''
  return [...counts.keys()][0]
}

/**
 * Un guardado de perfil sin cédula (formulario IPS o campo oculto) no borra
 * la que ya estaba en la cuenta.
 */
export function keepStoredDocumentNumber(current, incoming, documentType = 'CC') {
  const next = sanitizeDocumentNumber(incoming, documentType)
  if (next) return next
  return sanitizeDocumentNumber(current, documentType)
}
