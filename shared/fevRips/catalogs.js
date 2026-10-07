/**
 * Catálogos y matriz de cruces FEV/RIPS.
 * Documento Técnico 1 v003 (15 jul 2026), §1.8, más el tipo de usuario 14
 * cruzado con cobertura 06 (ADRES) del control de cambios §3.1.
 *
 * El concepto de recaudo 04 (anticipo) solo vive en el XML. No se lista
 * como recaudo válido del JSON RIPS.
 */

export const COBERTURA_INACTIVA = '01'

/** @type {Record<string, string>} */
export const COBERTURA_LABELS = {
  '01': 'Plan de beneficios financiado con UPC (inactivo; usar 16 o 17)',
  '02': 'Presupuesto máximo',
  '03': 'Prima EPS, no asegurados SOAT',
  '04': 'Cobertura póliza SOAT',
  '05': 'Cobertura ARL',
  '06': 'Cobertura ADRES',
  '07': 'Cobertura salud pública',
  '08': 'Cobertura entidad territorial, recursos de oferta',
  '09': 'Urgencias población migrante',
  '10': 'Plan complementario',
  '11': 'Plan medicina prepagada',
  '12': 'Pólizas en salud',
  '13': 'Cobertura régimen especial o de excepción',
  '14': 'Cobertura FNSPPL (INPEC)',
  '15': 'Particular',
  '16': 'Plan de beneficios UPC — régimen contributivo',
  '17': 'Plan de beneficios UPC — régimen subsidiado',
}

/** @type {Record<string, string>} */
export const MODALIDAD_PAGO_LABELS = {
  '01': 'Pago individual por caso / conjunto integral / paquete / canasta',
  '02': 'Pago global prospectivo',
  '03': 'Pago por capitación',
  '04': 'Pago por evento',
  '05': 'Otra modalidad',
}

/** @type {Record<string, string>} */
export const TIPO_USUARIO_LABELS = {
  '01': 'Contributivo cotizante',
  '02': 'Contributivo beneficiario',
  '03': 'Contributivo adicional',
  '04': 'Subsidiado',
  '05': 'No afiliado',
  '06': 'Especial o de excepción cotizante',
  '07': 'Especial o de excepción beneficiario',
  '08': 'Persona privada de la libertad a cargo del FNSPPL',
  '09': 'Tomador / amparado ARL',
  '10': 'Tomador / amparado SOAT',
  '11': 'Tomador / amparado planes voluntarios de salud',
  '12': 'Particular',
  '13': 'Especial o de excepción no cotizante',
  '14': 'Lesionado en accidente de tránsito sin seguro SOAT',
}

/** @type {Record<string, string>} */
export const CONCEPTO_RECAUDO_LABELS = {
  '01': 'Copago',
  '02': 'Cuota moderadora',
  '03': 'Pagos compartidos en planes voluntarios de salud',
  '04': 'Anticipo',
  '05': 'No aplica',
}

export const RECAUDO_ANTICIPO = '04'
export const RECAUDO_CUOTA_MODERADORA = '02'
export const RECAUDO_NO_APLICA = '05'

/** tipoOS cuyo código S06 debe ser CUPS (RVC024). */
export const TIPO_OS_CUPS = new Set(['02', '03'])

/** tipoOS de servicios complementarios, cuyo código sale de la tabla MIPRES (RVC025). */
export const TIPO_OS_MIPRES = '04'

/**
 * @typedef {{ modalidades: string[], tiposUsuario: string[], recaudosRips: string[] }} CrossRow
 */

/** @type {Record<string, CrossRow>} */
export const CROSS_MATRIX = {
  '02': { modalidades: ['04'], tiposUsuario: ['01', '02', '03', '04'], recaudosRips: ['01', '02'] },
  '04': { modalidades: ['01', '04'], tiposUsuario: ['10'], recaudosRips: ['05'] },
  '05': { modalidades: ['01', '02', '03', '04'], tiposUsuario: ['09'], recaudosRips: ['05'] },
  '06': {
    modalidades: ['01', '04'],
    tiposUsuario: ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12', '13', '14'],
    recaudosRips: ['05'],
  },
  '07': {
    modalidades: ['01', '03', '04'],
    tiposUsuario: ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12', '13'],
    recaudosRips: ['05'],
  },
  '08': { modalidades: ['04'], tiposUsuario: ['05'], recaudosRips: ['05'] },
  '09': { modalidades: ['04'], tiposUsuario: ['05'], recaudosRips: ['05'] },
  '10': { modalidades: ['01', '02', '03', '04'], tiposUsuario: ['11'], recaudosRips: ['03', '05'] },
  '11': { modalidades: ['01', '02', '03', '04'], tiposUsuario: ['11'], recaudosRips: ['03', '05'] },
  '12': { modalidades: ['01', '04'], tiposUsuario: ['11'], recaudosRips: ['03', '05'] },
  '13': { modalidades: ['01', '02', '03', '04'], tiposUsuario: ['06', '07', '13'], recaudosRips: ['05'] },
  '14': { modalidades: ['01', '02', '03', '04'], tiposUsuario: ['08'], recaudosRips: ['05'] },
  '15': { modalidades: ['01', '04'], tiposUsuario: ['12'], recaudosRips: ['05'] },
  '16': { modalidades: ['01', '02', '03', '04'], tiposUsuario: ['01', '02', '03'], recaudosRips: ['01', '02', '05'] },
  '17': { modalidades: ['01', '02', '03', '04'], tiposUsuario: ['04'], recaudosRips: ['01', '05'] },
}

/**
 * @param {unknown} value
 * @returns {string}
 */
export function code2(value) {
  const raw = String(value ?? '').trim()
  if (!raw) return ''
  if (!/^\d{1,2}$/.test(raw)) return raw
  return raw.padStart(2, '0')
}
