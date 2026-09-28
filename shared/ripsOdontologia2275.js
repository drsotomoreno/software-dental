import { parseRepsCode } from './repsCode.js'
import {
  validateRipsAttentionDateTime,
  validateRipsCodPrestador,
  validateRipsIdentificationDocument,
} from './ripsStructureValidation.js'

/** Consulta externa odontológica: 89.0.2, 89.0.3 y 89.0.7. */
const CUPS_CONSULTA_EXTERNA = /^890[237]\d{2}$/
/** Procedimientos del capítulo 23 de odontología. */
const CUPS_PROCEDIMIENTO_ODONTOLOGICO = /^23\d{4}$/
const CIE10_RIPS = /^[A-Z]\d{2}[0-9A-Z]{0,2}$/
const AUTORIZACION = /^[A-Za-z0-9]{1,30}$/
const GRUPO_CONSULTA_EXTERNA = '01'
const GRUPOS_PROCEDIMIENTO_AMBULATORIO = new Set(['01', '04'])
const DOCUMENTOS_PERSONA = new Set(['CC', 'CE', 'PA', 'RC', 'TI', 'CD', 'SC', 'PE', 'PT', 'NV'])

/**
 * Valida el JSON RIPS de consulta externa y procedimientos odontológicos
 * según la Resolución 2275.
 */
export class ValidadorRipsOdontologia2275 {
  /**
   * @param {import('../src/types/ripsOdontologia2275.ts').ContextoValidacionRipsOdontologia} [contexto]
   */
  constructor(contexto = {}) {
    this.contexto = contexto
  }

  /**
   * @param {object} rips
   * @returns {import('../src/types/ripsOdontologia2275.ts').ResultadoValidacionRipsOdontologia}
   */
  validar(rips) {
    /** @type {import('../src/types/ripsOdontologia2275.ts').ErrorValidacionRipsOdontologia[]} */
    const errores = []
    const usuarios = Array.isArray(rips?.usuarios) ? rips.usuarios : []

    if (usuarios.length === 0) {
      errores.push(issue('CUPS', 'usuarios', 'El paquete no tiene usuarios con servicios odontológicos.'))
    }

    usuarios.forEach((usuario, userIndex) => {
      const base = `usuarios[${userIndex}].servicios`
      const consultas = usuario?.servicios?.consultas ?? []
      const procedimientos = usuario?.servicios?.procedimientos ?? []
      consultas.forEach((consulta, index) => {
        errores.push(...this.validarConsultaExterna(consulta, `${base}.consultas[${index}]`))
      })
      procedimientos.forEach((procedimiento, index) => {
        errores.push(...this.validarProcedimientoOdontologico(procedimiento, `${base}.procedimientos[${index}]`))
      })
    })

    return {
      valido: errores.every((item) => item.level !== 'error'),
      errores,
    }
  }

  /**
   * @param {import('../src/types/ripsOdontologia2275.ts').ConsultaExternaOdontologica} consulta
   * @param {string} path
   */
  validarConsultaExterna(consulta, path) {
    const errores = []
    errores.push(...this.validarFechaInicio(consulta?.fechaInicioAtencion, `${path}.fechaInicioAtencion`))
    errores.push(...this.validarAutorizacion(consulta?.numAutorizacion, `${path}.numAutorizacion`))
    errores.push(...this.validarCie10(consulta?.codDiagnosticoPrincipal, `${path}.codDiagnosticoPrincipal`, true))
    for (const campo of ['codDiagnosticoRelacionado1', 'codDiagnosticoRelacionado2', 'codDiagnosticoRelacionado3']) {
      errores.push(...this.validarCie10(consulta?.[campo], `${path}.${campo}`, false))
    }
    errores.push(...this.validarValor(consulta?.vrServicio, `${path}.vrServicio`, 'de la consulta'))
    errores.push(...this.validarProfesionalIndependiente(consulta, path))
    errores.push(...this.validarCupsConsulta(consulta?.codConsulta, consulta?.grupoServicios, path))
    return errores
  }

  /**
   * @param {import('../src/types/ripsOdontologia2275.ts').ProcedimientoOdontologico} procedimiento
   * @param {string} path
   */
  validarProcedimientoOdontologico(procedimiento, path) {
    const errores = []
    errores.push(...this.validarFechaInicio(procedimiento?.fechaInicioAtencion, `${path}.fechaInicioAtencion`))
    errores.push(...this.validarAutorizacion(procedimiento?.numAutorizacion, `${path}.numAutorizacion`))
    errores.push(...this.validarCie10(procedimiento?.codDiagnosticoPrincipal, `${path}.codDiagnosticoPrincipal`, true))
    errores.push(...this.validarCie10(procedimiento?.codDiagnosticoRelacionado, `${path}.codDiagnosticoRelacionado`, false))
    errores.push(...this.validarValor(procedimiento?.vrServicio, `${path}.vrServicio`, 'del procedimiento'))
    errores.push(...this.validarProfesionalIndependiente(procedimiento, path))
    errores.push(...this.validarCupsProcedimiento(procedimiento?.codProcedimiento, procedimiento?.grupoServicios, path))
    return errores
  }

  validarFechaInicio(value, field) {
    const check = validateRipsAttentionDateTime(value, 'fechaInicioAtencion', {
      fechaGeneracion: this.contexto.fechaGeneracion,
    })
    if (check.valid) return []
    return [issue('FECHA_INICIO', field, check.message ?? 'fechaInicioAtencion inválida.')]
  }

  validarAutorizacion(value, field) {
    if (value == null) return []
    if (typeof value !== 'string' || !AUTORIZACION.test(value)) {
      return [
        issue(
          'AUTORIZACION',
          field,
          'numAutorizacion debe ser null si no hay autorización, o un código alfanumérico de 1 a 30 caracteres.',
        ),
      ]
    }
    return []
  }

  validarCie10(value, field, obligatorio) {
    if (value == null || value === '') {
      if (!obligatorio) return []
      return [issue('CIE10', field, 'El diagnóstico principal CIE-10 es obligatorio.')]
    }
    const raw = String(value).trim().toUpperCase()
    if (raw.includes('.')) {
      return [
        issue(
          'CIE10',
          field,
          `El CIE-10 en RIPS va sin punto (${raw} → ${raw.replace(/\./g, '')}).`,
        ),
      ]
    }
    if (!CIE10_RIPS.test(raw)) {
      return [issue('CIE10', field, `Código CIE-10 inválido: ${raw}.`)]
    }
    return []
  }

  validarValor(value, field, etiqueta) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return [issue('VALOR_CONSULTA', field, `El valor ${etiqueta} (vrServicio) debe ser un número.`)]
    }
    if (value < 0) {
      return [issue('VALOR_CONSULTA', field, `El valor ${etiqueta} no puede ser negativo.`)]
    }
    const decimals = String(value).split('.')[1]
    if (decimals && decimals.length > 2) {
      return [issue('VALOR_CONSULTA', field, `El valor ${etiqueta} admite como máximo dos decimales.`)]
    }
    return []
  }

  validarProfesionalIndependiente(linea, path) {
    const errores = []
    const reps = validateRipsCodPrestador(linea?.codPrestador)
    if (!reps.valid) {
      errores.push(issue('REPS', `${path}.codPrestador`, reps.message ?? 'Código REPS inválido.'))
    }

    const tipo = String(linea?.tipoDocumentoIdentificacion ?? '').trim().toUpperCase()
    if (tipo === 'NI' || tipo === 'NIT') {
      errores.push(
        issue(
          'PROFESIONAL',
          `${path}.tipoDocumentoIdentificacion`,
          'El profesional independiente se identifica con su documento personal, no con el NIT.',
        ),
      )
    } else if (tipo && !DOCUMENTOS_PERSONA.has(tipo)) {
      errores.push(
        issue('PROFESIONAL', `${path}.tipoDocumentoIdentificacion`, `Tipo de documento del profesional no admitido: ${tipo}.`),
      )
    }

    const documento = validateRipsIdentificationDocument(tipo, linea?.numDocumentoIdentificacion)
    if (!documento.valid) {
      errores.push(
        issue(
          'PROFESIONAL',
          `${path}.numDocumentoIdentificacion`,
          documento.message ?? 'Documento del profesional inválido.',
        ),
      )
    }

    const esperado = this.contexto.profesional
    if (esperado) {
      const sede = parseRepsCode(esperado.codPrestadorReps)
      if (sede.valid && reps.valid && linea.codPrestador !== sede.digits) {
        errores.push(
          issue(
            'REPS',
            `${path}.codPrestador`,
            `codPrestador (${linea.codPrestador}) no coincide con el REPS del profesional independiente (${sede.digits}).`,
          ),
        )
      }
      const numeroEsperado = String(esperado.numeroDocumento ?? '').trim()
      const tipoEsperado = String(esperado.tipoDocumento ?? '').trim().toUpperCase()
      if (numeroEsperado && String(linea?.numDocumentoIdentificacion ?? '').trim() !== numeroEsperado) {
        errores.push(
          issue(
            'PROFESIONAL',
            `${path}.numDocumentoIdentificacion`,
            'El documento de la atención no coincide con el del profesional independiente.',
          ),
        )
      }
      if (tipoEsperado && tipo !== tipoEsperado) {
        errores.push(
          issue(
            'PROFESIONAL',
            `${path}.tipoDocumentoIdentificacion`,
            'El tipo de documento de la atención no coincide con el del profesional independiente.',
          ),
        )
      }
    }

    return errores
  }

  validarCupsConsulta(codConsulta, grupoServicios, path) {
    const errores = []
    const cups = String(codConsulta ?? '').replace(/\D/g, '')
    if (!CUPS_CONSULTA_EXTERNA.test(cups)) {
      errores.push(
        issue(
          'CUPS',
          `${path}.codConsulta`,
          'La consulta externa odontológica exige un CUPS 8902, 8903 o 8907.',
        ),
      )
    }
    if (String(grupoServicios ?? '') !== GRUPO_CONSULTA_EXTERNA) {
      errores.push(
        issue('CUPS', `${path}.grupoServicios`, 'La consulta externa debe ir en grupoServicios 01.'),
      )
    }
    return errores
  }

  validarCupsProcedimiento(codProcedimiento, grupoServicios, path) {
    const errores = []
    const cups = String(codProcedimiento ?? '').replace(/\D/g, '')
    if (CUPS_CONSULTA_EXTERNA.test(cups)) {
      errores.push(
        issue('CUPS', `${path}.codProcedimiento`, 'Un CUPS de consulta no puede reportarse como procedimiento.'),
      )
    } else if (!CUPS_PROCEDIMIENTO_ODONTOLOGICO.test(cups)) {
      errores.push(
        issue(
          'CUPS',
          `${path}.codProcedimiento`,
          'El procedimiento odontológico debe ser un CUPS del capítulo 23.',
        ),
      )
    }
    if (!GRUPOS_PROCEDIMIENTO_AMBULATORIO.has(String(grupoServicios ?? ''))) {
      errores.push(
        issue(
          'CUPS',
          `${path}.grupoServicios`,
          'El procedimiento odontológico ambulatorio debe ir en grupoServicios 01 o 04.',
        ),
      )
    }
    return errores
  }
}

function issue(codigo, field, message) {
  return { level: 'error', codigo, field, message }
}

/**
 * @param {object} rips
 * @param {import('../src/types/ripsOdontologia2275.ts').ContextoValidacionRipsOdontologia} [contexto]
 */
export function validarRipsOdontologia2275(rips, contexto) {
  return new ValidadorRipsOdontologia2275(contexto).validar(rips)
}
