import { randomBytes } from 'node:crypto'
import { config } from '../config.js'
import { minsaludApiBaseUrl, obtenerTokenRealMinisterio } from './minsaludAuth.js'
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
  if (typeof payload === 'string') return [{ message: payload }]

  const candidates =
    payload.Errores ??
    payload.errores ??
    payload.errors ??
    payload.ResultadosValidacion ??
    payload.resultadosValidacion ??
    []

  if (!Array.isArray(candidates)) {
    const message = payload.mensaje ?? payload.message
    if (typeof message === 'string') return [{ message }]
    return []
  }

  if (candidates.length === 0) {
    const message = payload.mensaje ?? payload.message ?? payload.error
    if (typeof message === 'string' && message.trim()) return [{ message }]
    return []
  }

  return candidates.map((item) => ({
    code: item.Codigo ?? item.codigo ?? item.code,
    field: item.Campo ?? item.campo ?? item.field ?? item.Path,
    message: item.Descripcion ?? item.descripcion ?? item.message ?? item.mensaje ?? 'Error de validación',
    line: item.Linea ?? item.linea ?? item.line,
  }))
}

function resolveCredenciales(rips, metadatos = {}) {
  const credenciales = metadatos.credenciales ?? {}
  return {
    tipoUsuario: String(
      credenciales.tipoUsuario ?? metadatos.tipoUsuario ?? config.minsalud.tipoUsuario ?? '',
    ).trim(),
    numeroDocumento: String(
      credenciales.numeroDocumento ?? metadatos.numeroDocumento ?? config.minsalud.numeroDocumento ?? '',
    ).trim(),
    nitObligado: String(
      credenciales.nitObligado ??
        metadatos.nitObligado ??
        rips?.numDocumentoIdObligado ??
        config.minsalud.nit ??
        '',
    ).trim(),
  }
}

function credencialesCompletas(credenciales) {
  return Boolean(credenciales.tipoUsuario && credenciales.numeroDocumento && credenciales.nitObligado)
}

function minsaludValidateEndpoint() {
  const path = String(config.minsalud.validatePath ?? '/api/v1/validar').trim()
  if (/^https?:\/\//i.test(path)) return path
  const normalized = path.startsWith('/') ? path : `/${path}`
  return `${minsaludApiBaseUrl()}${normalized}`
}

function readCuv(data) {
  if (!data || typeof data !== 'object') return undefined
  return (
    data.CUV ??
    data.cuv ??
    data.codigoUnicoValidacion ??
    data.CodigoUnicoValidacion ??
    data.codigoUnicoValidacionToShow
  )
}

function readProcesoId(data) {
  if (!data || typeof data !== 'object') return undefined
  return (
    data.ProcesoId ??
    data.procesoId ??
    data.radicado ??
    data.idRadicado ??
    data.codigoRadicado ??
    data.identificador
  )
}

/**
 * Transmisión real del paquete (FEV + RIPS o RIPS sin factura 'RS') hacia SISPRO.
 * @param {object} payloadRips
 * @param {{ tipoUsuario: string, numeroDocumento: string, nitObligado: string }} credenciales
 * @param {string} [xmlFev] XML de la factura electrónica. Opcional si es RIPS sin factura (RS).
 */
export async function transmitirPaqueteRealMinisterio(payloadRips, credenciales, xmlFev) {
  try {
    const token = await obtenerTokenRealMinisterio(
      credenciales.tipoUsuario,
      credenciales.numeroDocumento,
      credenciales.nitObligado,
    )

    const formData = new FormData()
    const esSinFactura = payloadRips?.tipoNota === 'RS'
    if (!esSinFactura && xmlFev) {
      formData.append('fev', new Blob([xmlFev], { type: 'application/xml' }), 'factura.xml')
    }

    const nombreJson = esSinFactura ? 'rips_sin_factura.json' : 'rips.json'
    formData.append(
      'rips',
      new Blob([JSON.stringify(payloadRips)], { type: 'application/json' }),
      nombreJson,
    )

    const response = await fetch(minsaludValidateEndpoint(), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
      body: formData,
    })

    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      return {
        success: false,
        error: data?.mensaje || data?.message || data || response.statusText,
        httpStatus: response.status,
      }
    }

    return {
      success: true,
      data,
    }
  } catch (error) {
    return {
      success: false,
      error: error?.message || 'Fallo de transmisión con el MSPS',
    }
  }
}

/**
 * Envía el paquete RIPS al API REST del Ministerio y procesa la respuesta (CUV o errores).
 * @param {object} params
 * @param {object} params.rips - Paquete JSON RIPS Res. 2275
 * @param {object} [params.metadatos] - Metadatos de trazabilidad (UUID paciente, IDs clínicos)
 */
export async function submitRipsToMinsalud({ rips, metadatos = {} }) {
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

  const credenciales = resolveCredenciales(rips, metadatos)
  const useSandbox = config.minsalud.sandbox || !credencialesCompletas(credenciales)

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

  const xmlFev = metadatos.xmlFev ?? metadatos.fevXml ?? metadatos.dianXml
  const transmitted = await transmitirPaqueteRealMinisterio(rips, credenciales, xmlFev)

  if (!transmitted.success) {
    const errorPayload = transmitted.error
    return {
      success: false,
      source: 'minsalud',
      httpStatus: transmitted.httpStatus,
      localIssues,
      ministryErrors: normalizeMinistryErrors(
        errorPayload && typeof errorPayload === 'object' ? errorPayload : { message: String(errorPayload) },
      ),
      raw: errorPayload,
    }
  }

  const data = transmitted.data ?? {}
  const cuv = readCuv(data)
  const ministryErrors = normalizeMinistryErrors(data)
  const rejected =
    data.ResultState === false ||
    data.resultState === false ||
    data.estado === 'RECHAZADO' ||
    (ministryErrors.length > 0 && !cuv)

  if (rejected) {
    return {
      success: false,
      source: 'minsalud',
      localIssues,
      ministryErrors,
      raw: data,
    }
  }

  return {
    success: true,
    source: 'minsalud',
    localIssues: localIssues.filter((i) => i.level === 'warning'),
    cuv,
    procesoId: readProcesoId(data),
    fechaRadicacion: data.FechaRadicacion ?? data.fechaRadicacion ?? new Date().toISOString(),
    estado: data.Estado ?? data.estado ?? (cuv ? 'APROBADO' : 'RADICADO'),
    metadatos,
    raw: data,
  }
}

/**
 * Adaptador usado por la facturación FEV-Salud.
 * @param {object} rips
 * @param {{ metadatos?: object, invoice?: object, xmlFev?: string }} [options]
 */
export async function submitRipsToMinistry(rips, options = {}) {
  const metadatos = { ...(options.metadatos ?? {}) }
  const xmlFev = options.xmlFev ?? options.invoice?.xmlFev ?? options.invoice?.xml ?? metadatos.xmlFev
  if (xmlFev) metadatos.xmlFev = xmlFev

  const result = await submitRipsToMinsalud({ rips, metadatos })
  return {
    ...result,
    errors: result.ministryErrors ?? [],
    error: result.success ? undefined : 'MUV no devolvió CUV.',
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
