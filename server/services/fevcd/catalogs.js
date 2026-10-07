/**
 * Catálogo de la compra directa: medicamentos, dispositivos médicos y APME.
 * La factura es convencional: no lleva JSON de RIPS.
 */

export const ROLES_EMISOR = ['fabricante', 'importador', 'titular']

export const TIPOS_DOCUMENTO = {
  FEV: 'Factura electrónica de venta',
  NC: 'Nota crédito',
}

/** @type {Record<string, { codigo: string, etiqueta: string, identificador: string }>} */
export const TECNOLOGIAS = {
  medicamento: {
    codigo: 'MED',
    etiqueta: 'Medicamento',
    identificador: 'cum',
  },
  dispositivo: {
    codigo: 'DM',
    etiqueta: 'Dispositivo médico',
    identificador: 'registroSanitario',
  },
  apme: {
    codigo: 'APME',
    etiqueta: 'Alimento de propósito médico especial',
    identificador: 'registroSanitario',
  },
}

const CUCON_PATTERN = /^[0-9a-fA-F]{64}$/
const PRODUCT_CODE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9./-]{0,49}$/

/**
 * @param {'error' | 'warning'} level
 * @param {string} codigo
 * @param {string} field
 * @param {string} message
 */
function issue(level, codigo, field, message) {
  return { level, codigo, field, message }
}

/**
 * @param {unknown} xml
 * @returns {string}
 */
export function extractCucon(xml) {
  const text = String(xml ?? '')
  const match = text.match(/<(?:[\w-]+:)?(?:NUMERO_CONTRATO|CUCON)[^>]*>([0-9a-fA-F]{64})</i)
  return match?.[1] ?? ''
}

/**
 * Arma el documento de compra directa. Rechaza un RIPS adjunto.
 *
 * @param {object} input
 */
export function buildCompraDirecta(input = {}) {
  /** @type {Array<{ level: string, codigo: string, field: string, message: string }>} */
  const issues = []

  if (input.rips != null) {
    issues.push(issue(
      'error',
      'SIN_RIPS',
      'rips',
      'La compra directa se transmite sin RIPS. Es una factura convencional de venta masiva.',
    ))
  }

  const tecnologiaKey = String(input.tecnologia ?? '').trim().toLowerCase()
  const tecnologia = TECNOLOGIAS[tecnologiaKey]
  if (!tecnologia) {
    issues.push(issue(
      'error',
      'TECNOLOGIA',
      'tecnologia',
      'La tecnología debe ser medicamento, dispositivo o apme.',
    ))
  }

  const tipoDocumento = String(input.tipoDocumento ?? 'FEV').trim().toUpperCase()
  if (!TIPOS_DOCUMENTO[tipoDocumento]) {
    issues.push(issue('error', 'TIPO_DOCUMENTO', 'tipoDocumento', 'El tipo documental debe ser FEV o NC.'))
  }

  const rolEmisor = String(input.rolEmisor ?? '').trim().toLowerCase()
  if (!ROLES_EMISOR.includes(rolEmisor)) {
    issues.push(issue(
      'error',
      'ROL_EMISOR',
      'rolEmisor',
      'El emisor debe ser fabricante, importador o titular de registro sanitario.',
    ))
  }

  const xml = String(input.xml ?? '').trim()
  if (!xml.startsWith('<')) {
    issues.push(issue('error', 'XML', 'xml', 'Adjunte el XML de la factura convencional o de la nota crédito.'))
  }

  const cucon = String(input.cucon ?? extractCucon(xml)).trim()
  if (!CUCON_PATTERN.test(cucon)) {
    issues.push(issue(
      'error',
      'CUCON',
      'cucon',
      'El CUCON del contrato SIIFA debe tener 64 caracteres hexadecimales, en el cuerpo o en el XML.',
    ))
  }

  const lineas = normalizeLineas(input.lineas, tecnologia, issues)
  const webhook = String(input.webhook ?? '').trim()
  if (webhook && !/^https:\/\//i.test(webhook)) {
    issues.push(issue('error', 'WEBHOOK', 'webhook', 'El webhook opcional debe ser una URL https.'))
  }

  return {
    issues,
    document: tecnologia
      ? {
          guid: String(input.guid ?? '').trim() || null,
          tipoDocumento,
          tecnologia: tecnologia.codigo,
          tecnologiaClave: tecnologiaKey,
          rolEmisor,
          cucon: cucon.toLowerCase(),
          xml,
          lineas,
          webhook: webhook || null,
          sinRips: true,
        }
      : null,
  }
}

/**
 * @param {unknown} lineas
 * @param {{ codigo: string, identificador: string } | undefined} tecnologia
 * @param {Array<{ level: string, codigo: string, field: string, message: string }>} issues
 */
function normalizeLineas(lineas, tecnologia, issues) {
  if (!Array.isArray(lineas) || lineas.length === 0) {
    issues.push(issue(
      'error',
      'LINEAS',
      'lineas',
      'Informe al menos una línea del medicamento, dispositivo o APME.',
    ))
    return []
  }

  return lineas.map((linea, index) => {
    const field = `lineas[${index}]`
    const cantidad = Number(linea?.cantidad)
    if (!Number.isFinite(cantidad) || cantidad <= 0) {
      issues.push(issue('error', 'CANTIDAD', `${field}.cantidad`, 'La cantidad debe ser mayor que cero.'))
    }
    const descripcion = String(linea?.descripcion ?? '').trim()
    if (!descripcion) {
      issues.push(issue('error', 'DESCRIPCION', `${field}.descripcion`, 'La descripción de la línea es obligatoria.'))
    }

    const normalizada = {
      descripcion,
      cantidad: Number.isFinite(cantidad) ? cantidad : 0,
      unidad: String(linea?.unidad ?? 'NIU').trim() || 'NIU',
    }

    if (!tecnologia) return normalizada

    if (tecnologia.codigo === 'MED') {
      const cum = String(linea?.cum ?? '').trim()
      const ium = String(linea?.ium ?? '').trim()
      if (!PRODUCT_CODE_PATTERN.test(cum) && !PRODUCT_CODE_PATTERN.test(ium)) {
        issues.push(issue(
          'error',
          'MEDICAMENTO',
          `${field}.cum`,
          'El medicamento debe informar CUM o IUM.',
        ))
      }
      normalizada.cum = cum || null
      normalizada.ium = ium || null
      return normalizada
    }

    const registroSanitario = String(linea?.registroSanitario ?? '').trim()
    if (!PRODUCT_CODE_PATTERN.test(registroSanitario)) {
      issues.push(issue(
        'error',
        tecnologia.codigo,
        `${field}.registroSanitario`,
        `${tecnologia.codigo === 'APME' ? 'El APME' : 'El dispositivo médico'} debe informar el registro sanitario.`,
      ))
    }
    normalizada.registroSanitario = registroSanitario || null
    return normalizada
  })
}
