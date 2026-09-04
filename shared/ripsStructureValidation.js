/**
 * Validación de estructura y sintaxis RIPS JSON (Res. 2275 / MUV).
 * Módulo compartido cliente (Vite) y servidor (Node).
 */

/** @typedef {'error' | 'warning'} RipsValidationLevel */

/** @typedef {{ level: RipsValidationLevel, field?: string, message: string, patientDocument?: string }} RipsStructureIssue */

export const RIPS_IDENTIFICATION_TYPES = [
  'CC',
  'CE',
  'PA',
  'RC',
  'TI',
  'NV',
  'CD',
  'SC',
  'PE',
  'PT',
]

/** @type {Record<string, { minLength: number, maxLength: number, numericOnly: boolean, label: string }>} */
export const RIPS_IDENTIFICATION_TYPE_RULES = {
  CC: { label: 'Cédula de ciudadanía', minLength: 3, maxLength: 10, numericOnly: true },
  CE: { label: 'Cédula de extranjería', minLength: 3, maxLength: 7, numericOnly: true },
  PA: { label: 'Pasaporte', minLength: 1, maxLength: 16, numericOnly: false },
  RC: { label: 'Registro civil', minLength: 10, maxLength: 11, numericOnly: true },
  TI: { label: 'Tarjeta de identidad', minLength: 10, maxLength: 11, numericOnly: true },
  NV: { label: 'Certificado de nacido vivo', minLength: 6, maxLength: 16, numericOnly: false },
  CD: { label: 'Carné diplomático', minLength: 1, maxLength: 16, numericOnly: false },
  SC: { label: 'Salvoconducto', minLength: 1, maxLength: 16, numericOnly: false },
  PE: { label: 'Permiso especial de permanencia', minLength: 1, maxLength: 15, numericOnly: false },
  PT: { label: 'Permiso por protección temporal', minLength: 1, maxLength: 8, numericOnly: false },
}

/** Código REPS sede: exactamente 12 dígitos. */
export const RIPS_COD_PRESTADOR_PATTERN = /^\d{12}$/

/**
 * FEV / nota crédito-débito: Prefijo alfanumérico (1–4) + número consecutivo (DIAN).
 * Sin espacios, guiones ni caracteres especiales.
 */
export const RIPS_FEV_NUMERO_PATTERN = /^[A-Za-z][A-Za-z0-9]{0,3}\d{1,20}$/

/** fecConsumo / fechaInicioAtencion — ISO 8601 local YYYY-MM-DD HH:mm */
export const RIPS_DATETIME_PATTERN = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/

const PLAIN_DOCUMENT_PATTERN = /^[A-Za-z0-9]+$/
const NUMERIC_DOCUMENT_PATTERN = /^\d+$/

/**
 * @param {string} tipo
 * @returns {boolean}
 */
export function isRipsIdentificationType(tipo) {
  return RIPS_IDENTIFICATION_TYPES.includes(String(tipo ?? '').trim().toUpperCase())
}

/**
 * @param {string} value
 * @returns {{ valid: boolean, message?: string }}
 */
export function validateRipsIdentificationDocument(tipoDocumento, numDocumento) {
  const tipo = String(tipoDocumento ?? '').trim().toUpperCase()
  const numero = String(numDocumento ?? '').trim()

  if (!tipo) {
    return { valid: false, message: 'El tipo de documento de identificación es obligatorio.' }
  }

  if (!isRipsIdentificationType(tipo)) {
    return {
      valid: false,
      message:
        `tipoDocumentoIdentificacion «${tipo}» no es válido. ` +
        `Valores permitidos: ${RIPS_IDENTIFICATION_TYPES.join(', ')}.`,
    }
  }

  if (!numero) {
    return { valid: false, message: 'numDocumentoIdentificacion es obligatorio.' }
  }

  if (/\s/.test(numero) || /[-./_]/.test(numero) || /[^A-Za-z0-9]/.test(numero)) {
    return {
      valid: false,
      message:
        'numDocumentoIdentificacion no debe contener espacios, guiones ni caracteres especiales.',
    }
  }

  const rule = RIPS_IDENTIFICATION_TYPE_RULES[tipo]

  if (rule.numericOnly && !NUMERIC_DOCUMENT_PATTERN.test(numero)) {
    return {
      valid: false,
      message: `numDocumentoIdentificacion para ${tipo} debe contener solo dígitos (sin letras ni símbolos).`,
    }
  }

  if (!rule.numericOnly && !PLAIN_DOCUMENT_PATTERN.test(numero)) {
    return {
      valid: false,
      message: `numDocumentoIdentificacion para ${tipo} debe ser alfanumérico sin espacios ni símbolos.`,
    }
  }

  if (numero.length < rule.minLength || numero.length > rule.maxLength) {
    return {
      valid: false,
      message:
        `numDocumentoIdentificacion para ${tipo} (${rule.label}) debe tener entre ` +
        `${rule.minLength} y ${rule.maxLength} caracteres; recibido: ${numero.length}.`,
    }
  }

  return { valid: true }
}

/**
 * @param {string} codPrestador
 * @returns {{ valid: boolean, message?: string }}
 */
export function validateRipsCodPrestador(codPrestador) {
  const value = String(codPrestador ?? '').trim()

  if (!value) {
    return { valid: false, message: 'codPrestador es obligatorio.' }
  }

  if (/\D/.test(value)) {
    return {
      valid: false,
      message:
        'codPrestador debe ser una cadena de exactamente 12 dígitos (código REPS de la sede, ej. 6800103898-01 → 680010389801).',
    }
  }

  if (!RIPS_COD_PRESTADOR_PATTERN.test(value)) {
    return {
      valid: false,
      message: `codPrestador debe tener exactamente 12 dígitos; recibido: ${value.length}.`,
    }
  }

  return { valid: true }
}

/**
 * @param {string} numero
 * @param {{ label?: string }} [options]
 * @returns {{ valid: boolean, message?: string }}
 */
export function validateRipsFevNumero(numero, options = {}) {
  const label = options.label ?? 'numFactura'
  const value = String(numero ?? '').trim()

  if (!value) {
    return { valid: false, message: `${label} es obligatorio (FEV DIAN).` }
  }

  if (/\s/.test(value) || /[-./_]/.test(value) || /[^A-Za-z0-9]/.test(value)) {
    return {
      valid: false,
      message: `${label} no debe contener espacios, guiones ni caracteres especiales.`,
    }
  }

  if (!RIPS_FEV_NUMERO_PATTERN.test(value)) {
    return {
      valid: false,
      message:
        `${label} debe tener formato Prefijo + Número (ej. FV12345, SETP990000001): ` +
        'prefijo alfanumérico de 1 a 4 caracteres seguido del consecutivo numérico.',
    }
  }

  return { valid: true }
}

/**
 * @param {string} raw
 * @returns {Date | null}
 */
export function parseRipsDateTime(raw) {
  const value = String(raw ?? '').trim()
  if (!RIPS_DATETIME_PATTERN.test(value)) return null

  const [datePart, timePart] = value.split(' ')
  const [year, month, day] = datePart.split('-').map(Number)
  const [hour, minute] = timePart.split(':').map(Number)

  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day) ||
    !Number.isFinite(hour) ||
    !Number.isFinite(minute)
  ) {
    return null
  }

  const date = new Date(year, month - 1, day, hour, minute, 0, 0)
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day ||
    date.getHours() !== hour ||
    date.getMinutes() !== minute
  ) {
    return null
  }

  return date
}

/**
 * @param {string} rawDate
 * @returns {Date | null}
 */
function parseRipsDateOnly(rawDate) {
  const value = String(rawDate ?? '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(year, month - 1, day, 0, 0, 0, 0)
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null
  }
  return date
}

/**
 * Valida fecConsumo / fechaInicioAtencion (YYYY-MM-DD HH:mm).
 * @param {string} raw
 * @param {string} fieldLabel
 * @param {{ fechaGeneracion?: Date | string, convenioFechaInicio?: Date | string }} [context]
 * @returns {{ valid: boolean, message?: string }}
 */
export function validateRipsAttentionDateTime(raw, fieldLabel, context = {}) {
  const value = String(raw ?? '').trim()

  if (!value) {
    return { valid: false, message: `${fieldLabel} es obligatorio.` }
  }

  if (!RIPS_DATETIME_PATTERN.test(value)) {
    return {
      valid: false,
      message: `${fieldLabel} debe tener formato ISO 8601 YYYY-MM-DD HH:mm (ej. 2026-03-15 09:30).`,
    }
  }

  const parsed = parseRipsDateTime(value)
  if (!parsed) {
    return { valid: false, message: `${fieldLabel} contiene una fecha u hora inválida.` }
  }

  const fechaGeneracion =
    context.fechaGeneracion instanceof Date
      ? context.fechaGeneracion
      : context.fechaGeneracion
        ? parseRipsDateTime(String(context.fechaGeneracion)) ??
          parseRipsDateOnly(String(context.fechaGeneracion))
        : new Date()

  if (fechaGeneracion && parsed.getTime() > fechaGeneracion.getTime()) {
    return {
      valid: false,
      message:
        `${fieldLabel} (${value}) no puede ser posterior a la fecha de generación del RIPS ` +
        `(${formatRipsDateTimeLocal(fechaGeneracion)}).`,
    }
  }

  if (context.convenioFechaInicio) {
    const convenioInicio =
      context.convenioFechaInicio instanceof Date
        ? context.convenioFechaInicio
        : parseRipsDateTime(String(context.convenioFechaInicio)) ??
          parseRipsDateOnly(String(context.convenioFechaInicio))

    if (convenioInicio && parsed.getTime() < convenioInicio.getTime()) {
      return {
        valid: false,
        message:
          `${fieldLabel} (${value}) no puede ser anterior al inicio de vigencia del convenio ` +
          `(${formatRipsDateOnly(convenioInicio)}).`,
      }
    }
  }

  return { valid: true }
}

/**
 * @param {Date} date
 * @returns {string}
 */
function formatRipsDateTimeLocal(date) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/**
 * @param {Date} date
 * @returns {string}
 */
function formatRipsDateOnly(date) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/**
 * @param {import('../../src/types/rips').RipsTransaction} rips
 * @param {object} [context]
 * @returns {RipsStructureIssue[]}
 */
export function validateRipsStructureSyntax(rips, context = {}) {
  /** @type {RipsStructureIssue[]} */
  const issues = []

  const pushError = (field, message, extra = {}) => {
    issues.push({ level: 'error', field, message, ...extra })
  }

  const fechaGeneracion = context.fechaGeneracion ?? new Date()
  const convenioFechaInicio = context.convenioFechaInicio
  const fevReferencia = context.fevReferencia ?? rips?.numFactura

  const facturaCheck = validateRipsFevNumero(rips?.numFactura, { label: 'numFactura' })
  if (!facturaCheck.valid) {
    pushError('numFactura', facturaCheck.message)
  } else if (
    fevReferencia &&
    String(rips.numFactura).trim() !== String(fevReferencia).trim()
  ) {
    pushError(
      'numFactura',
      `numFactura («${rips.numFactura}») debe coincidir 1:1 con la FEV reportada ante la DIAN («${fevReferencia}»).`,
    )
  }

  if (rips?.tipoNota) {
    const notaCheck = validateRipsFevNumero(rips?.numNota, { label: 'numNota' })
    if (!notaCheck.valid) {
      pushError('numNota', notaCheck.message)
    }
  } else if (rips?.numNota?.trim()) {
    pushError(
      'numNota',
      'numNota solo debe informarse cuando tipoNota está definido (nota crédito/débito).',
    )
  }

  if (!Array.isArray(rips?.usuarios)) {
    pushError('usuarios', 'El arreglo usuarios es obligatorio en el JSON RIPS.')
    return issues
  }

  rips.usuarios.forEach((usuario, userIndex) => {
    const prefix = `usuarios[${userIndex}]`
    const patientRef = usuario?.numDocumentoIdentificacion

    const docCheck = validateRipsIdentificationDocument(
      usuario?.tipoDocumentoIdentificacion,
      usuario?.numDocumentoIdentificacion,
    )
    if (!docCheck.valid) {
      pushError(`${prefix}.numDocumentoIdentificacion`, docCheck.message, {
        patientDocument: patientRef,
      })
    }

    const servicios = usuario?.servicios ?? {}

    for (const [serviceKey, dateField] of [
      ['consultas', 'fechaInicioAtencion'],
      ['procedimientos', 'fechaInicioAtencion'],
    ]) {
      const items = servicios[serviceKey] ?? []
      items.forEach((item, idx) => {
        const fieldPath = `${prefix}.servicios.${serviceKey}[${idx}]`

        const prestadorCheck = validateRipsCodPrestador(item?.codPrestador)
        if (!prestadorCheck.valid) {
          pushError(`${fieldPath}.codPrestador`, prestadorCheck.message, {
            patientDocument: patientRef,
          })
        }

        const rawDate = item?.[dateField] ?? item?.fecConsumo ?? item?.fechaInicio
        const dateCheck = validateRipsAttentionDateTime(rawDate, dateField, {
          fechaGeneracion,
          convenioFechaInicio,
        })
        if (!dateCheck.valid) {
          pushError(`${fieldPath}.${dateField}`, dateCheck.message, {
            patientDocument: patientRef,
          })
        }

        if (item?.tipoDocumentoIdentificacion || item?.numDocumentoIdentificacion) {
          const profDocCheck = validateRipsIdentificationDocument(
            item.tipoDocumentoIdentificacion,
            item.numDocumentoIdentificacion,
          )
          if (!profDocCheck.valid) {
            pushError(`${fieldPath}.numDocumentoIdentificacion`, profDocCheck.message, {
              patientDocument: patientRef,
            })
          }
        }
      })
    }
  })

  if (context.codPrestador) {
    const metaPrestador = validateRipsCodPrestador(context.codPrestador)
    if (!metaPrestador.valid) {
      pushError('codPrestador', metaPrestador.message)
    }
  }

  return issues
}
