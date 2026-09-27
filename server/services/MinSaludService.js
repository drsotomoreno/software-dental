import { randomBytes } from 'node:crypto'
import { z } from 'zod'
import { config } from '../config.js'
import { obtenerTokenSISPRO, shouldUseMinsaludSandbox } from './MinSaludAuthService.js'
import { hasBlockingValidationErrors, validateRipsPackageLocally } from './ripsLocalValidator.js'

const ripsLineaSchema = z.object({}).passthrough()

/**
 * Paquete FEV-RIPS que se envía a CargarFevRips.
 * Los campos extra del JSON oficial se conservan (.passthrough()).
 */
export const fevRipsPackageSchema = z
  .object({
    numDocumentoIdObligado: z.string().trim().min(1, 'NIT del obligado es obligatorio.'),
    numFactura: z.string().trim().min(1).nullable(),
    tipoNota: z.string().nullable().optional(),
    numNota: z.string().nullable().optional(),
    usuarios: z
      .array(
        z
          .object({
            tipoDocumentoIdentificacion: z.string().trim().min(1),
            numDocumentoIdentificacion: z.string().trim().min(1),
            tipoUsuario: z.string().trim().min(1),
            fechaNacimiento: z.string().trim().min(1),
            codSexo: z.enum(['M', 'F']),
            consecutivo: z.number(),
            servicios: z
              .object({
                consultas: z.array(ripsLineaSchema).optional(),
                procedimientos: z.array(ripsLineaSchema).optional(),
                otrosServicios: z.array(ripsLineaSchema).optional(),
              })
              .passthrough(),
          })
          .passthrough(),
      )
      .min(1, 'El paquete debe incluir al menos un usuario.'),
  })
  .passthrough()

function generateSandboxCuv() {
  const segment = () => randomBytes(4).toString('hex').toUpperCase()
  return `CUV-${segment()}-${segment()}-${segment()}`
}

function zodIssuesToErrors(error) {
  return error.issues.map((issue) => ({
    code: 'ZOD',
    field: issue.path.join('.'),
    message: issue.message,
  }))
}

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
  const monthDiff = now.getMonth() - born.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < born.getDate())) age--
  return age
}

function buildCargarFevRipsRequest(paquete, token) {
  const path = config.minsalud.validatePath || '/api/PaquetesFevRips/CargarFevRips'
  const url = config.minsalud.apiBaseUrl ? `${config.minsalud.apiBaseUrl}${path}` : path
  return {
    method: 'POST',
    url,
    path,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      'X-NIT-Prestador': config.minsalud.nit || paquete.numDocumentoIdObligado,
    },
    body: paquete,
  }
}

async function postCargarFevRips(request) {
  if (shouldUseMinsaludSandbox()) {
    const ministryErrors = simulateMinistryCrossValidation(request.body)
    if (ministryErrors.length > 0) {
      return {
        ok: false,
        status: 422,
        data: { ResultState: false, Errores: ministryErrors },
      }
    }

    return {
      ok: true,
      status: 200,
      data: {
        ResultState: true,
        CUV: generateSandboxCuv(),
        ProcesoId: `PROC-${Date.now()}`,
        FechaRadicacion: new Date().toISOString(),
        Estado: 'APROBADO',
      },
    }
  }

  const response = await fetch(request.url, {
    method: 'POST',
    headers: request.headers,
    body: JSON.stringify(request.body),
  })
  const data = await response.json().catch(() => ({}))
  return { ok: response.ok, status: response.status, data }
}

function mapMinistryResult(httpResult, localIssues, metadatos, request) {
  const source = shouldUseMinsaludSandbox() ? 'sandbox' : 'minsalud'
  const data = httpResult.data ?? {}

  if (!httpResult.ok) {
    return {
      success: false,
      source,
      httpStatus: httpResult.status,
      endpoint: request.path,
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
      source,
      endpoint: request.path,
      localIssues,
      ministryErrors: normalizeMinistryErrors(data),
      raw: data,
    }
  }

  return {
    success: true,
    source,
    endpoint: request.path,
    localIssues: localIssues.filter((issue) => issue.level === 'warning'),
    cuv: data.CUV ?? data.cuv,
    procesoId: data.ProcesoId ?? data.procesoId,
    fechaRadicacion: data.FechaRadicacion ?? data.fechaRadicacion ?? new Date().toISOString(),
    estado: data.Estado ?? data.estado ?? 'APROBADO',
    metadatos,
    raw: shouldUseMinsaludSandbox() ? undefined : data,
  }
}

/**
 * Valida el JSON con Zod, obtiene el token SISPRO y transmite a CargarFevRips.
 * @param {object} params
 * @param {object} params.rips
 * @param {object} [params.metadatos]
 */
export async function cargarFevRips({ rips, metadatos = {} }) {
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

  const parsed = fevRipsPackageSchema.safeParse(rips)
  if (!parsed.success) {
    return {
      success: false,
      source: 'zod',
      localIssues,
      ministryErrors: zodIssuesToErrors(parsed.error),
    }
  }

  const token = await obtenerTokenSISPRO()
  const request = buildCargarFevRipsRequest(parsed.data, token)
  if (!request.headers.Authorization?.startsWith('Bearer ')) {
    return {
      success: false,
      source: 'auth',
      localIssues,
      ministryErrors: [{ message: 'El token SISPRO es obligatorio para CargarFevRips.' }],
    }
  }

  const httpResult = await postCargarFevRips(request)
  return mapMinistryResult(httpResult, localIssues, metadatos, request)
}
