import { TIPO_OS_CUPS, TIPO_OS_MIPRES } from './catalogs.js'

/** RVC058 — Documento Técnico 1 v003: el intervalo pasó de 500–5000 a 400–6000 g. */
export const RVC058_PESO_MIN_G = 400
export const RVC058_PESO_MAX_G = 6000

const CUPS_PATTERN = /^\d{6}$/
const MIPRES_CODE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9-]{0,19}$/

/**
 * @param {'error' | 'warning'} level
 * @param {string} code
 * @param {string} field
 * @param {string} message
 */
function issue(level, code, field, message) {
  return { level, code, field, message }
}

/**
 * @param {unknown} value
 * @returns {string | null}
 */
export function normalizeMipresId(value) {
  if (value == null) return null
  const text = String(value).trim()
  if (!text || text.toLowerCase() === 'null') return null
  return text
}

/**
 * IDEntrega de MIPRES (transacción 5): 1 a 19 caracteres.
 * No es el ID de reporte de entrega.
 *
 * @param {unknown} value
 * @param {string} field
 * @param {Array<{ level: string, code: string, field: string, message: string }>} issues
 */
export function validateIdEntregaMipres(value, field, issues) {
  const id = normalizeMipresId(value)
  if (id == null) return null
  if (id.length < 1 || id.length > 19 || /\s/.test(id)) {
    issues.push(issue(
      'error',
      'RVC024',
      field,
      'idMIPRES debe ser el IDEntrega de la transacción 5 de MIPRES (1 a 19 caracteres, sin relleno de ceros). No registre el ID de reporte de entrega.',
    ))
    return id
  }
  return id
}

/**
 * Si hay IDEntrega, la autorización es el ID de prescripción (20) o null.
 * Hasta 30 caracteres solo cuando es autorización del pagador financiada con UPC.
 *
 * @param {unknown} numAutorizacion
 * @param {string | null} idEntrega
 * @param {string} field
 * @param {Array<{ level: string, code: string, field: string, message: string }>} issues
 */
export function validatePrescripcionJuntoAIdEntrega(numAutorizacion, idEntrega, field, issues) {
  if (!idEntrega) return
  if (numAutorizacion == null || String(numAutorizacion).trim() === '' || String(numAutorizacion).trim().toLowerCase() === 'null') {
    return
  }
  const autorizacion = String(numAutorizacion).trim()
  if (autorizacion.length === 20) return
  if (autorizacion.length >= 1 && autorizacion.length <= 30) {
    issues.push(issue(
      'warning',
      'RVC024',
      field,
      'Con IDEntrega MIPRES, numAutorizacion debería ser el ID de prescripción de 20 caracteres. Una autorización UPC puede tener hasta 30.',
    ))
    return
  }
  issues.push(issue(
    'error',
    'RVC024',
    field,
    'numAutorizacion no puede superar 30 caracteres. El ID de prescripción MIPRES es de 20 caracteres fijos.',
  ))
}

/**
 * RVC024 deja el CUPS para traslado, transporte y estancia.
 * La prescripción MIPRES (servicios complementarios, presupuesto máximo u orden judicial)
 * se acepta en otros servicios con código de la tabla MIPRES y su IDEntrega (RVC025 / campo S06).
 *
 * @param {object | null | undefined} item
 * @param {string} field
 * @param {Array<{ level: string, code: string, field: string, message: string }>} issues
 */
export function validateRvc024OtrosServicios(item, field, issues) {
  const tipoOS = String(item?.tipoOS ?? '').trim().padStart(2, '0')
  const codigo = String(item?.codTecnologiaSalud ?? '').trim()
  const idEntrega = validateIdEntregaMipres(item?.idMIPRES, `${field}.idMIPRES`, issues)
  validatePrescripcionJuntoAIdEntrega(item?.numAutorizacion, idEntrega, `${field}.numAutorizacion`, issues)

  if (TIPO_OS_CUPS.has(tipoOS)) {
    if (!CUPS_PATTERN.test(codigo.replace(/\D/g, '').padStart(6, '0').slice(-6)) || codigo.replace(/\D/g, '').length !== 6) {
      issues.push(issue(
        'error',
        'RVC024',
        `${field}.codTecnologiaSalud`,
        'RVC024: el código de traslado, transporte o estancia debe ser un CUPS de 6 dígitos. Una prescripción MIPRES no se informa en este tipo de otro servicio.',
      ))
    }
    if (idEntrega) {
      issues.push(issue(
        'warning',
        'RVC024',
        `${field}.idMIPRES`,
        'El IDEntrega MIPRES corresponde a servicios complementarios (tipoOS 04), no a traslado, transporte o estancia.',
      ))
    }
    return
  }

  if (tipoOS === TIPO_OS_MIPRES || idEntrega) {
    if (!codigo) {
      issues.push(issue(
        'error',
        'RVC025',
        `${field}.codTecnologiaSalud`,
        'RVC025: el servicio complementario prescrito por MIPRES debe informar el código de la tabla MIPRES en codTecnologiaSalud.',
      ))
      return
    }
    if (!MIPRES_CODE_PATTERN.test(codigo)) {
      issues.push(issue(
        'error',
        'RVC025',
        `${field}.codTecnologiaSalud`,
        'RVC025: el código MIPRES de servicios complementarios debe ser alfanumérico (tabla de referencia MIPRES), no un texto libre.',
      ))
    }
    if (!idEntrega) {
      issues.push(issue(
        'error',
        'RVC024',
        `${field}.idMIPRES`,
        'La prescripción MIPRES debe incluir el IDEntrega de la transacción 5 (1 a 19 caracteres). No use el ID de reporte de entrega ni lo deje vacío.',
      ))
    }
  }
}

/**
 * Un procedimiento con IDEntrega es válido en formato, pero el Documento Técnico
 * pide registrar el complementario MIPRES en otros servicios.
 *
 * @param {object | null | undefined} item
 * @param {string} field
 * @param {Array<{ level: string, code: string, field: string, message: string }>} issues
 */
export function validateMipresEnProcedimiento(item, field, issues, options = {}) {
  const idEntrega = validateIdEntregaMipres(item?.idMIPRES, `${field}.idMIPRES`, issues)
  validatePrescripcionJuntoAIdEntrega(item?.numAutorizacion, idEntrega, `${field}.numAutorizacion`, issues)
  if (!idEntrega || options.tecnologia !== 'procedimiento') return
  issues.push(issue(
    'warning',
    'RVC024',
    field,
    'Los procedimientos prescritos por MIPRES como servicios complementarios (presupuesto máximo o tutela) se registran en otrosServicios, con el código de la tabla MIPRES.',
  ))
}

/**
 * @param {object | null | undefined} recienNacido
 * @param {string} field
 * @param {Array<{ level: string, code: string, field: string, message: string }>} issues
 */
export function validateRvc058Peso(recienNacido, field, issues) {
  const peso = recienNacido?.peso
  if (peso == null || peso === '') {
    issues.push(issue(
      'error',
      'RVC058',
      `${field}.peso`,
      'RVC058: el peso del recién nacido es obligatorio y se informa en gramos.',
    ))
    return
  }
  const value = Number(peso)
  if (!Number.isInteger(value) || value < RVC058_PESO_MIN_G || value > RVC058_PESO_MAX_G) {
    issues.push(issue(
      'error',
      'RVC058',
      `${field}.peso`,
      `RVC058: el peso del recién nacido debe estar entre ${RVC058_PESO_MIN_G} y ${RVC058_PESO_MAX_G} gramos. Registre gramos (3,2 kg = 3200), no kilos.`,
    ))
  }
}

/**
 * RVC057 también pasó de notificación a rechazo (20 a 46 semanas).
 *
 * @param {object | null | undefined} recienNacido
 * @param {string} field
 * @param {Array<{ level: string, code: string, field: string, message: string }>} issues
 */
export function validateRvc057EdadGestacional(recienNacido, field, issues) {
  const edad = Number(recienNacido?.edadGestacional)
  if (!Number.isInteger(edad) || edad < 20 || edad > 46) {
    issues.push(issue(
      'error',
      'RVC057',
      `${field}.edadGestacional`,
      'RVC057: la edad gestacional debe estar entre 20 y 46 semanas.',
    ))
  }
}
