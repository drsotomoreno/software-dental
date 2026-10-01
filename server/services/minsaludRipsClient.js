import { randomBytes } from 'node:crypto'
import { config, hasMinsaludCredentials } from '../config.js'
import {
  credencialesCompletas,
  resolverCredencialesPrestador,
} from './minsaludAuth.js'
import { prepararPayloadTransmision, transmitirRipsMultiusuario } from './ministerioService.js'
import { hasBlockingValidationErrors, validateRipsPackageLocally } from './ripsLocalValidator.js'

/**
 * Genera CUV simulado para entorno sandbox / desarrollo local.
 */
function generateSandboxCuv() {
  const segment = () => randomBytes(4).toString('hex').toUpperCase()
  return `CUV-${segment()}-${segment()}-${segment()}`
}

/**
 * Normaliza errores devueltos por el motor de validación del Ministerio.
 * @param {unknown} payload
 * @returns {Array<{code?:string,field?:string,message:string,line?:number}>}
 */
function normalizeMinistryErrors(payload) {
  if (!payload) return []

  const candidates =
    payload.Errores ??
    payload.errores ??
    payload.errors ??
    payload.ResultadosValidacion ??
    []

  if (!Array.isArray(candidates)) {
    if (typeof payload.message === 'string') {
      return [{ message: payload.message }]
    }
    return []
  }

  return candidates.map((item) => ({
    code: item.Codigo ?? item.codigo ?? item.code,
    field: item.Campo ?? item.campo ?? item.field ?? item.Path,
    message: item.Descripcion ?? item.descripcion ?? item.message ?? 'Error de validación',
    line: item.Linea ?? item.linea ?? item.line,
  }))
}

/**
 * Envía el paquete RIPS al API REST del Ministerio y procesa la respuesta (CUV o errores).
 * @param {object} params
 * @param {object} params.rips - Paquete JSON RIPS Res. 2275
 * @param {object} [params.metadatos] - Metadatos de trazabilidad (UUID paciente, IDs clínicos)
 * @param {object} [params.user] - Prestador que ejecuta la transacción
 * @param {{ tipoUsuario?: string, numeroDocumento?: string, nitObligado?: string }} [params.credenciales]
 * @param {string} [params.xmlFev] - XML de la FEV cuando el paquete va ligado a factura
 */
export async function submitRipsToMinsalud({ rips, metadatos = {}, user, credenciales, xmlFev } = {}) {
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

  const credencialesPrestador = resolverCredencialesPrestador({ user, rips, metadatos, credenciales })
  const useSandbox =
    config.minsalud.sandbox ||
    (!credencialesCompletas(credencialesPrestador) && !hasMinsaludCredentials())

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

  const { payloadRips, esSinFactura } = prepararPayloadTransmision(rips, metadatos)
  const transmision = await transmitirRipsMultiusuario(
    payloadRips,
    credencialesPrestador,
    esSinFactura ? undefined : xmlFev,
  )

  if (!transmision.success) {
    const raw = transmision.error
    const ministryErrors = normalizeMinistryErrors(raw)
    return {
      success: false,
      source: 'minsalud',
      localIssues,
      ministryErrors:
        ministryErrors.length > 0
          ? ministryErrors
          : [{ message: typeof raw === 'string' ? raw : 'No se pudo transmitir el paquete al Ministerio.' }],
      raw,
    }
  }

  const data = transmision.data ?? {}
  const approved =
    data.ResultState === true ||
    data.resultState === true ||
    data.estado === 'APROBADO' ||
    Boolean(data.CUV ?? data.cuv)

  if (!approved) {
    return {
      success: false,
      source: 'minsalud',
      localIssues,
      ministryErrors: normalizeMinistryErrors(data),
      mensaje: transmision.mensaje,
      raw: data,
    }
  }

  return {
    success: true,
    source: 'minsalud',
    localIssues: localIssues.filter((i) => i.level === 'warning'),
    cuv: data.CUV ?? data.cuv,
    procesoId: data.ProcesoId ?? data.procesoId,
    fechaRadicacion: data.FechaRadicacion ?? data.fechaRadicacion ?? new Date().toISOString(),
    estado: data.Estado ?? data.estado ?? 'APROBADO',
    mensaje: transmision.mensaje,
    metadatos,
    raw: data,
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

function getAgeYears(birthDate) {
  const born = new Date(birthDate)
  const now = new Date()
  let age = now.getFullYear() - born.getFullYear()
  const m = now.getMonth() - born.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < born.getDate())) age--
  return age
}
