import { randomBytes } from 'node:crypto'
import { config, hasMinsaludCredentials } from '../config.js'
import { isRipsSinFactura } from '../../shared/ripsStructureValidation.js'
import { getMinsaludAccessToken } from './minsaludAuth.js'
import { hasBlockingValidationErrors, validateRipsPackageLocally } from './ripsLocalValidator.js'

/** Ambiente de pruebas SISPRO cuando no hay MINSALUD_API_BASE_URL. */
const MSPS_STAGE_BASE_URL = 'https://stage-fevrips.sispro.gov.co'

function ministerioMultipartUrl() {
  const base = (config.minsalud.apiBaseUrl || MSPS_STAGE_BASE_URL).replace(/\/$/, '')
  const path = process.env.MINSALUD_MULTIPART_VALIDATE_URL || '/api/v1/validar'
  return `${base}${path.startsWith('/') ? path : `/${path}`}`
}

/**
 * Arma el FormData del Ministerio. RIPS sin factura (RS) adjunta solo el JSON.
 * @param {string} jsonRips
 * @param {string | null} tipoNota
 * @param {string | null} xmlFev
 */
export function buildMinisterioFormData(jsonRips, tipoNota = null, xmlFev = null) {
  const formData = new FormData()
  if (isRipsSinFactura(tipoNota)) {
    formData.append(
      'rips',
      new Blob([jsonRips], { type: 'application/json' }),
      'rips_sin_factura.json',
    )
    return formData
  }

  if (!xmlFev) {
    const error = new Error('Se requiere el XML de la FEV para esta modalidad.')
    error.code = 'FEV_XML_REQUIRED'
    throw error
  }

  formData.append('fev', new Blob([xmlFev], { type: 'application/xml' }), 'factura.xml')
  formData.append('rips', new Blob([jsonRips], { type: 'application/json' }), 'rips.json')
  return formData
}

/**
 * Envía el paquete al Ministerio. Si es RIPS sin factura (RS), solo envía el JSON.
 * @param {string | object} jsonRips
 * @param {{ tipoUsuario?: string, documento?: string, nit?: string }} [credenciales]
 * @param {string | null} [tipoNota]
 * @param {string | null} [xmlFev]
 */
export async function enviarPaqueteAlMinisterio(
  jsonRips,
  credenciales = {},
  tipoNota = null,
  xmlFev = null,
) {
  try {
    const token = await getMinsaludAccessToken()
    if (!token) {
      return {
        success: false,
        error: 'No hay credenciales del Ministerio para obtener el token.',
        ministryErrors: [],
      }
    }

    const jsonText = typeof jsonRips === 'string' ? jsonRips : JSON.stringify(jsonRips)
    const formData = buildMinisterioFormData(jsonText, tipoNota, xmlFev)
    const response = await fetch(ministerioMultipartUrl(), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'X-NIT-Prestador': credenciales?.nit || config.minsalud.nit || '',
      },
      body: formData,
    })

    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      const message =
        (typeof data?.message === 'string' && data.message) ||
        (typeof data?.Message === 'string' && data.Message) ||
        `El Ministerio respondió HTTP ${response.status}.`
      return {
        success: false,
        error: message,
        data,
        httpStatus: response.status,
        source: 'minsalud',
        ministryErrors: normalizeMinistryErrors(data),
      }
    }

    const cuv = data.CUV ?? data.cuv ?? data.CodigoUnicoValidacion
    const approved =
      data.ResultState === true ||
      data.resultState === true ||
      data.estado === 'APROBADO' ||
      Boolean(cuv)

    if (!approved) {
      return {
        success: false,
        error: 'El Ministerio no aprobó el paquete.',
        data,
        source: 'minsalud',
        ministryErrors: normalizeMinistryErrors(data),
      }
    }

    return {
      success: true,
      data,
      source: 'minsalud',
      cuv,
      procesoId: data.ProcesoId ?? data.procesoId,
      fechaRadicacion: data.FechaRadicacion ?? data.fechaRadicacion ?? new Date().toISOString(),
      estado: data.Estado ?? data.estado ?? 'APROBADO',
    }
  } catch (error) {
    return {
      success: false,
      error: error?.message || 'No se pudo enviar el paquete al Ministerio.',
      ministryErrors: [],
    }
  }
}

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
 */
export async function submitRipsToMinsalud({ rips, metadatos = {} }) {
  const esSinFactura = isRipsSinFactura(rips?.tipoNota)
  const localIssues = validateRipsPackageLocally(rips, {
    crossValidateAgeSex: true,
    perfilFiscal: metadatos.perfilFiscal,
    esRipsTemporal: metadatos.esRipsTemporal || esSinFactura,
    allowNullNumFactura: metadatos.allowNullNumFactura || esSinFactura,
  })
  if (hasBlockingValidationErrors(localIssues)) {
    return {
      success: false,
      source: 'local',
      localIssues,
      ministryErrors: [],
    }
  }

  const useSandbox = config.minsalud.sandbox || !hasMinsaludCredentials()

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

  const xmlFev = metadatos.xmlFev ?? null
  if (esSinFactura || xmlFev) {
    const packed = await enviarPaqueteAlMinisterio(
      JSON.stringify(rips),
      { nit: metadatos.nit || rips.numDocumentoIdObligado },
      esSinFactura ? 'RS' : (rips?.tipoNota ?? null),
      esSinFactura ? null : xmlFev,
    )
    if (!packed.success) {
      return {
        success: false,
        source: packed.source ?? 'minsalud',
        httpStatus: packed.httpStatus,
        localIssues,
        ministryErrors: packed.ministryErrors ?? [],
        error: packed.error,
        raw: packed.data,
      }
    }

    return {
      success: true,
      source: 'minsalud',
      localIssues: localIssues.filter((i) => i.level === 'warning'),
      cuv: packed.cuv,
      procesoId: packed.procesoId,
      fechaRadicacion: packed.fechaRadicacion,
      estado: packed.estado,
      metadatos,
      raw: packed.data,
    }
  }

  const token = await getMinsaludAccessToken()
  const { apiBaseUrl, validatePath, nit } = config.minsalud
  const url = `${apiBaseUrl}${validatePath}`

  const payload = {
    rips,
    metadatos: {
      ...metadatos,
      nitObligado: rips.numDocumentoIdObligado,
      numFactura: rips.numFactura,
    },
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      'X-NIT-Prestador': nit || rips.numDocumentoIdObligado,
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
