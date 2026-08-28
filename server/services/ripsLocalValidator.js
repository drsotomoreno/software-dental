/**
 * Validación local previa al envío al Ministerio de Salud.
 * Replica reglas críticas de Res. 2275 / Documento Técnico RIPS JSON.
 */

import { validateRipsStructureSyntax } from '../../shared/ripsStructureValidation.js'

function pushError(errors, field, message, extra = {}) {
  errors.push({ level: 'error', field, message, ...extra })
}

function pushWarning(errors, field, message, extra = {}) {
  errors.push({ level: 'warning', field, message, ...extra })
}

function normalizeCie10(code) {
  return String(code ?? '').replace(/\./g, '').trim().toUpperCase()
}

function normalizeCups(code) {
  return String(code ?? '').replace(/\D/g, '').padStart(6, '0').slice(0, 6)
}

/**
 * Valida estructura sintáctica y reglas de negocio básicas del paquete RIPS.
 * @param {import('../../src/types/rips').RipsTransaction} rips
 * @param {object} [context]
 * @returns {Array<{level:string,field?:string,message:string}>}
 */
export function validateRipsPackageLocally(rips, context = {}) {
  const errors = []

  const structureIssues = validateRipsStructureSyntax(rips, {
    fechaGeneracion: context.fechaGeneracion ?? new Date(),
    convenioFechaInicio: context.convenioFechaInicio,
    fevReferencia: context.fevReferencia ?? rips?.numFactura,
    codPrestador: context.codPrestador,
  })
  errors.push(...structureIssues)

  if (!rips?.numDocumentoIdObligado?.trim()) {
    pushError(errors, 'numDocumentoIdObligado', 'NIT del obligado a reportar es obligatorio.')
  }

  if (!Array.isArray(rips?.usuarios) || rips.usuarios.length === 0) {
    pushError(errors, 'usuarios', 'El paquete RIPS debe incluir al menos un usuario (paciente).')
    return errors
  }

  let totalConsultas = 0
  let totalProcedimientos = 0

  rips.usuarios.forEach((usuario, userIndex) => {
    const prefix = `usuarios[${userIndex}]`

    if (!usuario.fechaNacimiento) {
      pushError(errors, `${prefix}.fechaNacimiento`, 'Fecha de nacimiento del paciente es obligatoria.')
    }

    if (!['M', 'F'].includes(usuario.codSexo)) {
      pushError(errors, `${prefix}.codSexo`, 'Código de sexo inválido (debe ser M o F).')
    }

    if (!usuario.codMunicipioResidencia?.trim()) {
      pushWarning(errors, `${prefix}.codMunicipioResidencia`, 'Código municipio DANE ausente; use código válido.')
    }

    const servicios = usuario.servicios ?? {}
    const consultas = servicios.consultas ?? []
    const procedimientos = servicios.procedimientos ?? []
    totalConsultas += consultas.length
    totalProcedimientos += procedimientos.length

    consultas.forEach((consulta, idx) => {
      const field = `${prefix}.servicios.consultas[${idx}]`
      if (!/^\d{6}$/.test(normalizeCups(consulta.codConsulta))) {
        pushError(errors, `${field}.codConsulta`, `CUPS de consulta inválido: ${consulta.codConsulta}`)
      }
      if (!normalizeCie10(consulta.codDiagnosticoPrincipal)) {
        pushError(errors, `${field}.codDiagnosticoPrincipal`, 'Diagnóstico principal CIE-10 obligatorio.')
      }
    })

    procedimientos.forEach((proc, idx) => {
      const field = `${prefix}.servicios.procedimientos[${idx}]`
      if (!/^\d{6}$/.test(normalizeCups(proc.codProcedimiento))) {
        pushError(errors, `${field}.codProcedimiento`, `CUPS de procedimiento inválido: ${proc.codProcedimiento}`)
      }
      if (!normalizeCie10(proc.codDiagnosticoPrincipal)) {
        pushError(errors, `${field}.codDiagnosticoPrincipal`, 'Diagnóstico principal CIE-10 obligatorio en procedimiento.')
      }

      if (context.crossValidateAgeSex && usuario.fechaNacimiento && usuario.codSexo) {
        const age = getAgeYears(usuario.fechaNacimiento)
        const cups = normalizeCups(proc.codProcedimiento)
        if (age < 6 && cups.startsWith('23')) {
          pushWarning(
            errors,
            field,
            `Validación cruzada: procedimiento ${cups} poco frecuente para edad ${age} años.`,
          )
        }
      }
    })
  })

  if (totalConsultas === 0 && totalProcedimientos === 0) {
    pushError(errors, 'servicios', 'El RIPS no contiene consultas ni procedimientos.')
  }

  return errors
}

function getAgeYears(birthDate) {
  const born = new Date(birthDate)
  const now = new Date()
  let age = now.getFullYear() - born.getFullYear()
  const monthDiff = now.getMonth() - born.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < born.getDate())) age--
  return age
}

export function hasBlockingValidationErrors(issues) {
  return issues.some((issue) => issue.level === 'error')
}
