/**
 * Campos del acuerdo de voluntades y CUCON (Res. 948 de 2026, arts. 3 y 11).
 * Son transitorios: si todavía no hay CUCON ni justificación, la generación sigue.
 * Un CUCON presente pero mal formado sí bloquea, porque el MUV lo rechazaría.
 */

const CUCON_PATTERN = /^[0-9a-fA-F]{64}$/

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
 * @param {object | null | undefined} acuerdo
 * @returns {Array<{ level: string, code: string, field: string, message: string }>}
 */
export function validateAcuerdoVoluntades(acuerdo) {
  /** @type {Array<{ level: string, code: string, field: string, message: string }>} */
  const issues = []
  const cucon = String(acuerdo?.cucon ?? '').trim()
  const poliza = String(acuerdo?.numeroPoliza ?? '').trim()
  const justificacion = String(acuerdo?.justificacionSinContrato ?? '').trim()

  if (!cucon && !justificacion) {
    issues.push(issue(
      'warning',
      'CUCON',
      'acuerdoVoluntades.cucon',
      'CUCON aún no bloquea la generación. Cuando el cronograma SIIFA lo exija, informe el Código Único de Contrato (64 caracteres hexadecimales) o la justificación de factura sin contrato.',
    ))
  }

  if (cucon && !CUCON_PATTERN.test(cucon)) {
    issues.push(issue(
      'error',
      'CUCON',
      'acuerdoVoluntades.cucon',
      'El CUCON debe ser el hash SHA-256 del contrato en SIIFA: 64 caracteres hexadecimales.',
    ))
  }

  if (cucon && justificacion) {
    issues.push(issue(
      'warning',
      'CUCON',
      'acuerdoVoluntades.justificacionSinContrato',
      'Hay CUCON y también justificación de factura sin contrato. Informe solo uno de los dos.',
    ))
  }

  if (poliza && poliza.length > 30) {
    issues.push(issue(
      'error',
      'POLIZA',
      'acuerdoVoluntades.numeroPoliza',
      'El número de póliza SOAT o de plan voluntario no debe superar 30 caracteres.',
    ))
  }

  return issues
}

function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Fragmento XML de los campos adicionales. Omite los que aún no existen.
 *
 * @param {object | null | undefined} acuerdo
 * @param {{ modalidadPago?: string, coberturaPlanBeneficios?: string }} [sector]
 */
export function renderAcuerdoVoluntadesXml(acuerdo, sector = {}) {
  const nodes = []
  const modalidad = String(sector.modalidadPago ?? acuerdo?.modalidadPago ?? '').trim()
  const cobertura = String(sector.coberturaPlanBeneficios ?? acuerdo?.coberturaPlanBeneficios ?? '').trim()
  const cucon = String(acuerdo?.cucon ?? '').trim()
  const poliza = String(acuerdo?.numeroPoliza ?? '').trim()
  const justificacion = String(acuerdo?.justificacionSinContrato ?? '').trim()

  if (modalidad) nodes.push(`<salud:ModalidadPago>${escapeXml(modalidad)}</salud:ModalidadPago>`)
  if (cobertura) nodes.push(`<salud:CoberturaPlanBeneficios>${escapeXml(cobertura)}</salud:CoberturaPlanBeneficios>`)
  if (cucon && CUCON_PATTERN.test(cucon)) {
    nodes.push(`<salud:NumeroContrato>${escapeXml(cucon)}</salud:NumeroContrato>`)
  }
  if (poliza && poliza.length <= 30) nodes.push(`<salud:NumeroPoliza>${escapeXml(poliza)}</salud:NumeroPoliza>`)
  if (justificacion) {
    nodes.push(`<salud:JustificacionFacturaSinContrato>${escapeXml(justificacion)}</salud:JustificacionFacturaSinContrato>`)
  }
  return nodes.join('')
}
