import { randomBytes } from 'node:crypto'
import { config, hasMinsaludCredentials } from '../config.js'
import { hasBlockingValidationErrors, validateRipsPackageLocally } from './ripsLocalValidator.js'
import { MuvInfrastructureError, SisproMuvService, describirFalloTransporte } from './sisproMuvService.js'

/**
 * Genera CUV simulado para entorno sandbox / desarrollo local.
 */
function generateSandboxCuv() {
  const segment = () => randomBytes(4).toString('hex').toUpperCase()
  return `CUV-${segment()}-${segment()}-${segment()}`
}

/**
 * Envía el paquete RIPS al MUV y procesa la respuesta (CUV o errores).
 * En producción usa LoginSISPRO y CargarRipsSinFactura / CargarFevRips.
 * @param {object} params
 * @param {object} params.rips - Paquete JSON RIPS Res. 2275
 * @param {object} [params.metadatos] - Metadatos de trazabilidad (UUID paciente, IDs clínicos)
 * @param {{ service?: { enviar: Function }, sandbox?: boolean, hasCredentials?: boolean }} [deps]
 */
export async function submitRipsToMinsalud({ rips, metadatos = {} }, deps = {}) {
  const localIssues = validateRipsPackageLocally(rips, {
    crossValidateAgeSex: true,
    perfilFiscal: metadatos.perfilFiscal,
    esRipsTemporal: metadatos.esRipsTemporal,
    allowNullNumFactura: metadatos.allowNullNumFactura,
  })
  if (hasBlockingValidationErrors(localIssues)) {
    return {
      success: false,
      source: 'local',
      localIssues,
      ministryErrors: [],
    }
  }

  const sandbox = deps.sandbox ?? config.minsalud.sandbox
  const credenciales = deps.hasCredentials ?? hasMinsaludCredentials()
  const useSandbox = sandbox || !credenciales

  if (useSandbox) {
    const ministryErrors = simulateMinistryCrossValidation(rips)
    if (ministryErrors.length > 0) {
      return {
        success: false,
        source: 'sandbox',
        localIssues,
        ministryErrors,
      }
    }

    return {
      success: true,
      source: 'sandbox',
      localIssues: localIssues.filter((i) => i.level === 'warning'),
      cuv: generateSandboxCuv(),
      procesoId: `PROC-${Date.now()}`,
      fechaRadicacion: new Date().toISOString(),
      estado: 'APROBADO',
      metadatos,
    }
  }

  try {
    const service = deps.service ?? servicioParaValidar()
    const outcome = await service.enviar({
      rips,
      cufe: metadatos.cufe ?? metadatos.CUFE ?? '',
      xmlFevFile: metadatos.xmlFevFile ?? '',
    })
    if (!outcome.success) {
      return {
        success: false,
        source: 'minsalud',
        httpStatus: outcome.httpStatus ?? 422,
        localIssues,
        ministryErrors: erroresDeMinisterio(outcome.errors),
        code: 'MUV_RECHAZO',
      }
    }
    return {
      success: true,
      source: 'minsalud',
      localIssues: localIssues.filter((i) => i.level === 'warning'),
      cuv: outcome.cuv,
      procesoId: outcome.response?.ProcesoId ?? outcome.response?.procesoId ?? null,
      fechaRadicacion: new Date().toISOString(),
      estado: 'APROBADO',
      metadatos,
    }
  } catch (error) {
    return falloDeInfraestructura(error, localIssues)
  }
}

/** Simula rechazos del MUV por inconsistencias comunes en sandbox. */
function simulateMinistryCrossValidation(rips) {
  const errors = []

  for (const usuario of rips.usuarios ?? []) {
    const age = getAgeYears(usuario.fechaNacimiento)
    for (const proc of usuario.servicios?.procedimientos ?? []) {
      const cups = String(proc.codProcedimiento ?? '').replace(/\D/g, '')
      if (usuario.codSexo === 'F' && cups === '862001' && age < 15) {
        errors.push({
          code: 'VX-SEXO-EDAD',
          field: 'servicios.procedimientos.codProcedimiento',
          message: 'Inconsistencia edad/sexo vs procedimiento CUPS (validación cruzada simulada).',
        })
      }
    }
  }

  return errors
}

let servicioValidacion = null

function servicioParaValidar() {
  if (!servicioValidacion) servicioValidacion = new SisproMuvService()
  return servicioValidacion
}

function erroresDeMinisterio(errors) {
  return (Array.isArray(errors) ? errors : []).map((item) => ({
    code: item?.code,
    field: item?.path || undefined,
    message: item?.message || 'El MUV rechazó el campo.',
  }))
}

function falloDeInfraestructura(error, localIssues) {
  const infra = error instanceof MuvInfrastructureError || error?.name === 'MuvInfrastructureError' ? error : null
  const fallo = infra
    ? { message: infra.message, code: infra.code, status: infra.status }
    : describirFalloTransporte(error)
  const deCampo = infra && Array.isArray(infra.errors) ? erroresDeMinisterio(infra.errors) : []
  const esRed =
    fallo.code === 'MUV_NETWORK' ||
    fallo.code === 'MUV_TIMEOUT' ||
    fallo.code === 'MUV_AUTH' ||
    fallo.code === 'MUV_CREDENTIALS_MISSING'
  const detalle = esRed
    ? deCampo
        .map((item) => item.message)
        .filter((message) => message && message !== fallo.message)
        .slice(0, 2)
        .join(' ')
    : ''
  return {
    success: false,
    source: 'minsalud',
    localIssues,
    ministryErrors: esRed ? [] : deCampo,
    error: detalle ? `${fallo.message} ${detalle}`.slice(0, 500) : fallo.message,
    code: fallo.code,
    httpStatus: fallo.status ?? 503,
  }
}

function getAgeYears(birthDate) {
  const born = new Date(birthDate)
  const now = new Date()
  let age = now.getFullYear() - born.getFullYear()
  const m = now.getMonth() - born.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < born.getDate())) age--
  return age
}
