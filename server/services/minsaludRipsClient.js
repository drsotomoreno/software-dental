import { randomBytes } from 'node:crypto'
import { config, hasMinsaludCredentials } from '../config.js'
import { getMinsaludAccessToken } from './minsaludAuth.js'
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
 * En el flujo FEV se adjunta el XML de la factura y el CUFE ya legalizado por la DIAN.
 *
 * @param {object} params
 * @param {object} params.rips - Paquete JSON RIPS Res. 2275
 * @param {object} [params.metadatos] - Metadatos de trazabilidad (UUID paciente, IDs clínicos)
 * @param {string} [params.facturaXml] - XML FEV aprobado por la DIAN
 * @param {string} [params.cufe] - CUFE a cruzar con el RIPS
 * @param {boolean} [params.requireCufe]
 */
export async function submitRipsToMinsalud({
  rips,
  metadatos = {},
  facturaXml,
  cufe,
  requireCufe = false,
} = {}) {
  const injectedCufe = String(cufe ?? rips?.cufe ?? metadatos.cufe ?? '').trim() || null
  const payloadRips = injectedCufe ? { ...rips, cufe: injectedCufe } : rips
  const needCufe = Boolean(facturaXml || requireCufe || metadatos.requireCufe)

  const localIssues = validateRipsPackageLocally(payloadRips, {
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

  if (needCufe && !injectedCufe) {
    return {
      success: false,
      source: 'local',
      localIssues,
      ministryErrors: [
        {
          code: 'MUV-CUFE',
          field: 'cufe',
          message: 'El CUFE DIAN es obligatorio en el RIPS antes de radicar el paquete en MUV.',
        },
      ],
    }
  }

  const useSandbox = config.minsalud.sandbox || !hasMinsaludCredentials()

  if (useSandbox) {
    const ministryErrors = simulateMinistryCrossValidation(payloadRips)
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

  const token = await getMinsaludAccessToken()
  const { apiBaseUrl, validatePath, nit } = config.minsalud
  const url = `${apiBaseUrl}${validatePath}`

  const payload = {
    rips: payloadRips,
    facturaXml: facturaXml || undefined,
    cufe: injectedCufe || undefined,
    metadatos: {
      ...metadatos,
      nitObligado: payloadRips.numDocumentoIdObligado,
      numFactura: payloadRips.numFactura,
      cufe: injectedCufe || undefined,
    },
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      'X-NIT-Prestador': nit || payloadRips.numDocumentoIdObligado,
    },
    body: JSON.stringify(payload),
  })

  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    return {
      success: false,
      source: 'minsalud',
      httpStatus: response.status,
      localIssues,
      ministryErrors: normalizeMinistryErrors(data),
      raw: data,
    }
  }

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

export { submitRipsToMinsalud as submitRipsToMinistry }
