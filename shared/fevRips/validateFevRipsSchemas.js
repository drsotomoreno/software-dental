import {
  COBERTURA_INACTIVA,
  COBERTURA_LABELS,
  CROSS_MATRIX,
  RECAUDO_ANTICIPO,
  RECAUDO_CUOTA_MODERADORA,
  RECAUDO_NO_APLICA,
  code2,
} from './catalogs.js'
import { validateAcuerdoVoluntades } from './acuerdoVoluntades.js'
import {
  validateMipresEnProcedimiento,
  validateRvc024OtrosServicios,
  validateRvc057EdadGestacional,
  validateRvc058Peso,
} from './transversalRules.js'

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
 * @param {object | null | undefined} servicios
 */
function serviceLines(servicios) {
  const source = servicios ?? {}
  return [
    ...(source.consultas ?? []).map((item, index) => ({
      item,
      field: `servicios.consultas[${index}]`,
      cups: item?.codConsulta,
    })),
    ...(source.procedimientos ?? []).map((item, index) => ({
      item,
      field: `servicios.procedimientos[${index}]`,
      cups: item?.codProcedimiento,
    })),
    ...(source.medicamentos ?? []).map((item, index) => ({
      item,
      field: `servicios.medicamentos[${index}]`,
      cups: item?.codTecnologiaSalud,
    })),
    ...(source.otrosServicios ?? []).map((item, index) => ({
      item,
      field: `servicios.otrosServicios[${index}]`,
      cups: item?.codTecnologiaSalud,
    })),
  ]
}

/**
 * Matriz cobertura × modalidad × tipo de usuario × recaudo (CIN005, CIN006, RVC005).
 *
 * @param {object} params
 * @param {string} params.cobertura
 * @param {string} params.modalidadPago
 * @param {Array<{ tipoUsuario?: string, field: string, lines: ReturnType<typeof serviceLines> }>} params.usuarios
 */
export function validateCrossMatrix({ cobertura, modalidadPago, usuarios }) {
  /** @type {Array<{ level: string, code: string, field: string, message: string }>} */
  const issues = []
  const coberturaCode = code2(cobertura)
  const modalidad = code2(modalidadPago)

  if (!coberturaCode || !modalidad) {
    issues.push(issue(
      'error',
      'CIN005',
      'fev.coberturaPlanBeneficios',
      'Antes de enviar al MUV informe cobertura o plan de beneficios y modalidad de pago. Sin ese cruce el mecanismo rechaza el paquete.',
    ))
    return issues
  }

  if (coberturaCode === COBERTURA_INACTIVA) {
    issues.push(issue(
      'error',
      'CIN005',
      'fev.coberturaPlanBeneficios',
      'La cobertura 01 está inactiva. Use 16 (UPC contributivo) o 17 (UPC subsidiado).',
    ))
    return issues
  }

  const row = CROSS_MATRIX[coberturaCode]
  if (!row) {
    issues.push(issue(
      'warning',
      'CIN005',
      'fev.coberturaPlanBeneficios',
      `La cobertura ${coberturaCode} (${COBERTURA_LABELS[coberturaCode] ?? 'sin etiqueta local'}) no está en la matriz publicada. Confírmela en SISPRO antes de enviarla al MUV.`,
    ))
    return issues
  }

  if (!row.modalidades.includes(modalidad)) {
    issues.push(issue(
      'error',
      'CIN005',
      'fev.modalidadPago',
      `CIN005: la modalidad de pago ${modalidad} no corresponde a la cobertura ${coberturaCode}. Modalidades permitidas: ${row.modalidades.join(', ')}.`,
    ))
  }

  for (const usuario of usuarios) {
    const tipo = code2(usuario.tipoUsuario)
    if (!row.tiposUsuario.includes(tipo)) {
      issues.push(issue(
        'error',
        'RVC005',
        `${usuario.field}.tipoUsuario`,
        `RVC005: el tipo de usuario ${tipo || '(vacío)'} no está asociado a la cobertura ${coberturaCode}.`,
      ))
    }

    for (const line of usuario.lines) {
      const recaudo = code2(line.item?.conceptoRecaudo)
      const field = `${usuario.field}.${line.field}.conceptoRecaudo`
      if (!recaudo) {
        issues.push(issue('error', 'CIN006', field, 'CIN006: cada servicio debe informar conceptoRecaudo.'))
        continue
      }
      if (recaudo === RECAUDO_ANTICIPO) {
        issues.push(issue(
          'error',
          'CIN006',
          field,
          'El concepto de recaudo 04 (anticipo) solo se informa en el XML de la FEV, no en el RIPS soporte.',
        ))
        continue
      }
      if (coberturaCode === '17' && recaudo === RECAUDO_CUOTA_MODERADORA) {
        issues.push(issue(
          'error',
          'CIN006',
          field,
          'CIN006: la cuota moderadora no aplica al régimen subsidiado (cobertura 17).',
        ))
        continue
      }
      if (!row.recaudosRips.includes(recaudo)) {
        issues.push(issue(
          'error',
          'CIN006',
          field,
          `CIN006: el concepto de recaudo ${recaudo} no puede cruzarse con la cobertura ${coberturaCode}. Recaudos RIPS permitidos: ${row.recaudosRips.join(', ')}.`,
        ))
      }

      const valor = Number(line.item?.valorPagoModerador ?? 0)
      if ((recaudo === RECAUDO_CUOTA_MODERADORA || recaudo === '03') && !(valor >= 1)) {
        issues.push(issue(
          'error',
          'RVC060',
          `${usuario.field}.${line.field}.valorPagoModerador`,
          'RVC060: si el recaudo es cuota moderadora o pago compartido, el valor debe ser mayor o igual a 1.',
        ))
      }
      if (recaudo === RECAUDO_NO_APLICA && valor !== 0) {
        issues.push(issue(
          'error',
          'RVC061',
          `${usuario.field}.${line.field}.valorPagoModerador`,
          'RVC061: si el recaudo es «no aplica», el valor del pago moderador debe ser 0.',
        ))
      }
    }
  }

  return issues
}

/**
 * Validación previa del JSON RIPS y de los campos FEV antes del MUV.
 *
 * @param {object} params
 * @param {object} params.rips
 * @param {object} [params.fev]
 * @param {boolean} [params.enforceCrossMatrix]
 * @param {boolean} [params.checkAcuerdo]
 */
export function validateFevRipsSchemas({
  rips,
  fev = {},
  enforceCrossMatrix = false,
  checkAcuerdo = false,
} = {}) {
  /** @type {Array<{ level: string, code: string, field: string, message: string }>} */
  const issues = []
  const usuarios = Array.isArray(rips?.usuarios) ? rips.usuarios : []

  usuarios.forEach((usuario, userIndex) => {
    const prefix = `usuarios[${userIndex}]`
    const servicios = usuario?.servicios ?? {}

    ;(servicios.procedimientos ?? []).forEach((item, index) => {
      validateMipresEnProcedimiento(item, `${prefix}.servicios.procedimientos[${index}]`, issues, {
        tecnologia: 'procedimiento',
      })
    })
    ;(servicios.medicamentos ?? []).forEach((item, index) => {
      validateMipresEnProcedimiento(item, `${prefix}.servicios.medicamentos[${index}]`, issues, {
        tecnologia: 'medicamento',
      })
    })
    ;(servicios.otrosServicios ?? []).forEach((item, index) => {
      validateRvc024OtrosServicios(item, `${prefix}.servicios.otrosServicios[${index}]`, issues)
    })
    ;(servicios.recienNacidos ?? []).forEach((item, index) => {
      const field = `${prefix}.servicios.recienNacidos[${index}]`
      validateRvc058Peso(item, field, issues)
      validateRvc057EdadGestacional(item, field, issues)
    })
  })

  const cobertura = fev.coberturaPlanBeneficios ?? fev.cobertura ?? rips?.acuerdoVoluntades?.coberturaPlanBeneficios
  const modalidadPago = fev.modalidadPago ?? rips?.acuerdoVoluntades?.modalidadPago
  const hasSector = Boolean(code2(cobertura) || code2(modalidadPago))

  if (enforceCrossMatrix || hasSector) {
    issues.push(...validateCrossMatrix({
      cobertura,
      modalidadPago,
      usuarios: usuarios.map((usuario, userIndex) => ({
        tipoUsuario: usuario?.tipoUsuario,
        field: `usuarios[${userIndex}]`,
        lines: serviceLines(usuario?.servicios),
      })),
    }))
  }

  if (checkAcuerdo || fev.acuerdoVoluntades || rips?.acuerdoVoluntades) {
    issues.push(...validateAcuerdoVoluntades(fev.acuerdoVoluntades ?? rips?.acuerdoVoluntades ?? {}))
  }

  return issues
}

export function hasBlockingFevRipsErrors(issues) {
  return issues.some((item) => item.level === 'error')
}
