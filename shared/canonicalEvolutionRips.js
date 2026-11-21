/**
 * Fuente única de verdad — Evolución Clínica → RIPS → MUV
 * (Res. 1995/1999 · Res. 2275/2023)
 *
 * UI, gate de firma y payload MUV DEBEN usar solo estas funciones.
 * No leer cupsCode / ripsMetadata.cupsCode / catálogo por separado.
 */

export const CIE10_RIPS_PATTERN = /^[A-Z]\d{2}[0-9A-Z]{0,2}$/
export const CUPS_RIPS_PATTERN = /^\d{6}$/

const PUNTEADO_MINSALUD = /(\d{2})\.(\d)\.(\d)\.(\d{2})(?!\d)/g
const PUNTEADO_PARES = /(\d{2})\.(\d{2})\.(\d{2})(?!\d)/g
const COMPACTO = /(?<!\d)(\d{6})(?!\d)/g

/** @typedef {'sign' | 'send'} CanonicalRipsValidationMode */
/** @typedef {'fev' | 'sin_factura' | 'valor_cero' | 'non_rips'} CanonicalBillingMode */

/**
 * @typedef {object} CanonicalRipsValidationError
 * @property {string} code
 * @property {string} field
 * @property {string} message
 * @property {string} [fix]
 * @property {'patient' | 'clinical' | 'billing' | 'professional'} [scope]
 */

/**
 * @typedef {object} CanonicalRipsValidationResult
 * @property {boolean} valid
 * @property {CanonicalRipsValidationError[]} errors
 */

function text(value) {
  return String(value ?? '').trim()
}

export function compactCie10Code(value) {
  return text(value).replace(/[.\s]/g, '').toUpperCase()
}

export function normalizeCupsDigits(value) {
  return text(value).replace(/\D/g, '').slice(0, 6)
}

export function isValidCupsCode(value) {
  return CUPS_RIPS_PATTERN.test(normalizeCupsDigits(value)) && normalizeCupsDigits(value).length === 6
}

export function isValidCie10Code(value) {
  const code = compactCie10Code(value)
  return Boolean(code) && CIE10_RIPS_PATTERN.test(code)
}

function pushCups(destino, codigo) {
  const digits = normalizeCupsDigits(codigo)
  if (CUPS_RIPS_PATTERN.test(digits) && !destino.includes(digits)) destino.push(digits)
}

/** Extrae CUPS explícitos de un texto (compacto o punteado MinSalud). */
export function cupsFromText(value) {
  const destino = []
  let resto = text(value)
  if (!resto) return destino

  for (const match of resto.matchAll(PUNTEADO_MINSALUD)) {
    pushCups(destino, `${match[1]}${match[2]}${match[3]}${match[4]}`)
  }
  resto = resto.replace(PUNTEADO_MINSALUD, ' ')

  for (const match of resto.matchAll(PUNTEADO_PARES)) {
    pushCups(destino, `${match[1]}${match[2]}${match[3]}`)
  }
  resto = resto.replace(PUNTEADO_PARES, ' ')

  for (const match of resto.matchAll(COMPACTO)) {
    pushCups(destino, match[1])
  }
  return destino
}

function cupsFromFuente(value) {
  if (value == null) return []
  if (typeof value === 'string' || typeof value === 'number') {
    const digits = normalizeCupsDigits(value)
    if (CUPS_RIPS_PATTERN.test(digits) && digits.length === 6) return [digits]
    return cupsFromText(String(value))
  }
  return []
}

function isNonRipsOnlyNote(note) {
  if (!note || typeof note !== 'object') return false
  if (note.requiereCupsRips === false) {
    const services = Array.isArray(note.catalogServices) ? note.catalogServices : []
    if (services.length === 0) return true
  }
  const services = (Array.isArray(note.catalogServices) ? note.catalogServices : []).filter(
    (service) =>
      Boolean(service?.dentalServiceId) ||
      Boolean(text(service?.serviceName)) ||
      Boolean(text(service?.procedure)),
  )
  if (services.length === 0) return false
  return services.every((service) => service.requiereCupsRips === false)
}

function metadataDe(note) {
  return note?.ripsMetadata && typeof note.ripsMetadata === 'object' ? note.ripsMetadata : {}
}

/**
 * Prioridad CUPS (única):
 * 1) ripsMetadata.cupsCode
 * 2) note.cupsCode
 * 3) catálogo / texto del procedimiento
 */
export function resolveCanonicalCupsCodes(note) {
  const meta = metadataDe(note)
  const ordered = []
  const fuentes = [
    meta.cupsCode,
    note?.cupsCode,
    ...(Array.isArray(note?.catalogServices)
      ? note.catalogServices.flatMap((service) =>
          service?.requiereCupsRips === false
            ? []
            : [service?.cupsCode, service?.procedure, service?.serviceName],
        )
      : []),
    note?.serviceName,
    note?.procedure,
  ]
  for (const fuente of fuentes) {
    for (const cups of cupsFromFuente(fuente)) {
      if (!ordered.includes(cups)) ordered.push(cups)
    }
  }
  return ordered
}

export function resolveCanonicalCie10Principal(note) {
  const meta = metadataDe(note)
  const candidates = [
    meta.codDiagnosticoPrincipal,
    ...(Array.isArray(note?.diagnoses) ? note.diagnoses.map((d) => d?.code) : []),
    ...(Array.isArray(note?.catalogServices) ? note.catalogServices.map((s) => s?.cie10Code) : []),
  ]
  for (const raw of candidates) {
    const code = compactCie10Code(raw)
    if (isValidCie10Code(code)) return code
  }
  return ''
}

function inferTipoVinculacion(note, clinicConfig = {}) {
  const meta = metadataDe(note)
  if (meta.tipoVinculacionFinanciera) return meta.tipoVinculacionFinanciera
  if (clinicConfig.tipoVinculacionFinanciera) return clinicConfig.tipoVinculacionFinanciera
  if ((note?.cost ?? 0) === 0 || note?.isBillable === false || note?.estadoRips === 'SIN_COSTO') {
    return 'valor_cero'
  }
  return 'recibo_interno'
}

/**
 * @param {object} note
 * @param {object} [patient]
 * @param {object} [clinicConfig]
 */
export function resolveCanonicalEvolutionRips(note, patient = {}, clinicConfig = {}) {
  const meta = metadataDe(note)
  const requiresRips = !isNonRipsOnlyNote(note)
  const cupsCodes = resolveCanonicalCupsCodes(note)
  const cie10Principal = resolveCanonicalCie10Principal(note)
  const tipoVinculacion = inferTipoVinculacion(note, clinicConfig)
  const billingMode =
    !requiresRips
      ? 'non_rips'
      : tipoVinculacion === 'fev'
        ? 'fev'
        : tipoVinculacion === 'valor_cero'
          ? 'valor_cero'
          : 'sin_factura'

  const documentType = text(patient.documentType || patient.tipoDocumento || 'CC').toUpperCase()
  const documentNumber = text(patient.documentNumber || patient.numeroDocumento)
  const birthDate = text(patient.birthDate || patient.fechaNacimiento)
  const genderRaw = text(patient.gender || patient.sexo || patient.codSexo).toUpperCase()
  const gender = genderRaw === 'F' || genderRaw === 'M' ? genderRaw : genderRaw === 'O' ? '' : genderRaw
  const municipalityCode = text(patient.municipalityCode || patient.codMunicipioResidencia)
  const regime = text(patient.regime || patient.regimen)

  return {
    noteId: note?.id ?? null,
    requiresRips,
    cupsCodes,
    primaryCups: cupsCodes[0] || '',
    cie10Principal,
    tipoVinculacion,
    billingMode,
    idFacturaElectronica: text(meta.idFacturaElectronica) || null,
    idReciboAsociado: text(meta.idReciboAsociado) || null,
    numeroSoportePago: text(note?.numeroSoportePago) || null,
    fechaAtencion: text(note?.date || note?.signedAt || note?.createdAt),
    ripsEstado: meta.ripsEstado || 'sin_preparar',
    finalidadTecnologia: text(meta.finalidadTecnologia) || '11',
    causaMotivoAtencion: text(meta.causaMotivoAtencion) || '38',
    conceptoRecaudo: text(meta.conceptoRecaudo) || '05',
    isLocked: Boolean(note?.isLocked || (text(note?.signedAt) && text(note?.contentHash))),
    patient: {
      documentType,
      documentNumber,
      birthDate,
      gender,
      municipalityCode,
      regime,
    },
    clinic: {
      providerNit: text(clinicConfig.providerNit || clinicConfig.nit),
      repsCode: text(clinicConfig.repsCode),
      documentType: text(clinicConfig.documentType || 'CC').toUpperCase(),
      documentNumber: text(clinicConfig.documentNumber || note?.professionalLicense),
    },
  }
}

function err(code, field, message, fix, scope) {
  return { code, field, message, fix, scope }
}

function birthDateLooksValid(value) {
  const raw = text(value)
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const d = new Date(`${raw}T00:00:00`)
    return !Number.isNaN(d.getTime())
  }
  const d = new Date(raw)
  return Boolean(raw) && !Number.isNaN(d.getTime())
}

function fechaAtencionLooksValid(value) {
  const raw = text(value)
  if (!raw) return false
  if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(raw)) return true
  const d = new Date(raw)
  return !Number.isNaN(d.getTime())
}

/**
 * Contrato único de validación (frontend + backend).
 * @param {ReturnType<typeof resolveCanonicalEvolutionRips>} resolved
 * @param {CanonicalRipsValidationMode} mode
 * @returns {CanonicalRipsValidationResult}
 */
export function validateCanonicalEvolutionRips(resolved, mode = 'send') {
  /** @type {CanonicalRipsValidationError[]} */
  const errors = []

  if (!resolved || typeof resolved !== 'object') {
    return {
      valid: false,
      errors: [
        err('RIPS_RESOLVED_MISSING', 'note', 'No se pudo resolver el contrato RIPS de la evolución.', undefined, 'clinical'),
      ],
    }
  }

  if (!resolved.requiresRips) {
    return { valid: true, errors: [] }
  }

  // Paciente (ficha) — obligatorio para firmar RIPS y para enviar
  if (!resolved.patient.documentType) {
    errors.push(
      err(
        'PATIENT_DOC_TYPE',
        'patient.documentType',
        'Falta el tipo de documento del paciente para RIPS.',
        'Abra la ficha del paciente y complete el tipo de documento (CC, TI, etc.).',
        'patient',
      ),
    )
  }
  if (!resolved.patient.documentNumber) {
    errors.push(
      err(
        'PATIENT_DOC_NUMBER',
        'patient.documentNumber',
        'Falta el número de documento del paciente para RIPS.',
        'Complete el número de documento en la ficha del paciente (no reescribe la nota firmada).',
        'patient',
      ),
    )
  }
  if (!resolved.patient.birthDate || !birthDateLooksValid(resolved.patient.birthDate)) {
    errors.push(
      err(
        'PATIENT_BIRTHDATE',
        'patient.birthDate',
        'La fecha de nacimiento del paciente es obligatoria y debe ser válida para RIPS.',
        'Complete o corrija la fecha de nacimiento en la ficha del paciente.',
        'patient',
      ),
    )
  }
  if (resolved.patient.gender !== 'M' && resolved.patient.gender !== 'F') {
    errors.push(
      err(
        'PATIENT_GENDER',
        'patient.gender',
        'El sexo biológico del paciente debe ser M o F para RIPS / MUV.',
        'Actualice el sexo en la ficha del paciente (M/F).',
        'patient',
      ),
    )
  }
  if (!resolved.patient.municipalityCode) {
    errors.push(
      err(
        'PATIENT_MUNICIPALITY',
        'patient.municipalityCode',
        'Falta el municipio de residencia del paciente para RIPS.',
        'Complete el municipio/divipola (y zona) en la ficha del paciente.',
        'patient',
      ),
    )
  }

  // Clínicos / administrativos
  if (!resolved.primaryCups || !isValidCupsCode(resolved.primaryCups)) {
    errors.push(
      err(
        'CUPS_REQUIRED',
        'cupsCode',
        'Se requiere un código CUPS válido de 6 dígitos.',
        'Seleccione un procedimiento del catálogo con CUPS o digite el Código de servicio (6 dígitos).',
        'clinical',
      ),
    )
  }
  if (!resolved.cie10Principal || !isValidCie10Code(resolved.cie10Principal)) {
    errors.push(
      err(
        'CIE10_REQUIRED',
        'codDiagnosticoPrincipal',
        'El diagnóstico principal CIE-10 es obligatorio para RIPS.',
        'Indique el CIE-10 principal en el procedimiento o en Vinculación Administrativa y RIPS.',
        'clinical',
      ),
    )
  }
  if (!fechaAtencionLooksValid(resolved.fechaAtencion)) {
    errors.push(
      err(
        'ATTENTION_DATE',
        'date',
        'La fecha y hora de atención no son válidas.',
        'Corrija la fecha/hora de la sesión en la evolución (si ya está firmada, use nota aclaratoria).',
        'clinical',
      ),
    )
  }

  // Facturación MUV — solo al enviar
  if (mode === 'send') {
    if (resolved.billingMode === 'fev') {
      const numFactura = resolved.numeroSoportePago || resolved.idFacturaElectronica
      if (!numFactura) {
        errors.push(
          err(
            'FEV_NUM_FACTURA',
            'idFacturaElectronica',
            'Para CargarFevRips debe vincular una factura electrónica con numFactura.',
            'Seleccione la FEV del paciente en Vinculación Administrativa y RIPS.',
            'billing',
          ),
        )
      }
    }
    if (resolved.billingMode === 'sin_factura' && !resolved.idReciboAsociado && resolved.tipoVinculacion === 'recibo_interno') {
      errors.push(
        err(
          'RECIBO_REQUIRED',
          'idReciboAsociado',
          'Seleccione un recibo de caja válido del paciente para RIPS sin factura.',
          'Vincule el recibo de caja en Vinculación Administrativa y RIPS.',
          'billing',
        ),
      )
    }
    if (!resolved.clinic.documentNumber) {
      errors.push(
        err(
          'PRESTADOR_DOC',
          'prestador.documentNumber',
          'El documento del prestador/odontólogo es obligatorio para el RIPS.',
          'Verifique el perfil del profesional (cédula / ReTHUS).',
          'professional',
        ),
      )
    }
  }

  return { valid: errors.length === 0, errors }
}

/**
 * Atajo: resuelve + valida en un solo paso.
 * @param {object} note
 * @param {object} [patient]
 * @param {object} [clinicConfig]
 * @param {CanonicalRipsValidationMode} [mode]
 */
export function resolveAndValidateCanonicalEvolutionRips(
  note,
  patient = {},
  clinicConfig = {},
  mode = 'send',
) {
  const resolved = resolveCanonicalEvolutionRips(note, patient, clinicConfig)
  const validation = validateCanonicalEvolutionRips(resolved, mode)
  return { resolved, validation }
}

/**
 * Política de envío sin factura (RVG06): numFactura null, tipoNota RS, numNota.
 * Los arreglos vacíos de servicios se normalizan aparte con normalizarEstructuraRips.
 */
export function applySinFacturaBillingContract(rips, numNotaSeed) {
  if (!rips || typeof rips !== 'object' || Array.isArray(rips)) return rips
  return {
    ...rips,
    numFactura: null,
    tipoNota: rips.tipoNota || 'RS',
    numNota: rips.numNota || `NOTA-${numNotaSeed || Date.now()}`,
  }
}
