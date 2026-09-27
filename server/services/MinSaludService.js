import { randomBytes } from 'node:crypto'
import { z } from 'zod'
import { config } from '../config.js'
import { extraerCuv, extraerGlosas, muvClient } from './muvClient.js'
import { minSaludAuth, shouldUseMinsaludSandbox } from './MinSaludAuthService.js'
import { resolveMuvAmbiente } from './muvAmbiente.js'
import { hasBlockingValidationErrors, validateRipsPackageLocally } from './ripsLocalValidator.js'

const ripsLineaSchema = z.object({}).passthrough()

/** CUPS de odontología general: seis dígitos que terminan en 03 (890203, 890303, 890703). */
const CUPS_ODONTOLOGIA_GENERAL = /^\d{4}03$/
/** CIE-10 sin puntos: K020, K021, S025, etc. */
const CIE10 = /^[A-Z]\d{2}[0-9A-Z]{0,2}$/

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

function cupsOdontologiaGeneral(value) {
  return CUPS_ODONTOLOGIA_GENERAL.test(String(value ?? '').replace(/\D/g, ''))
}

function cie10Valido(value) {
  return CIE10.test(String(value ?? '').replace(/\./g, '').trim().toUpperCase())
}

/**
 * Reglas estrictas de odontología general aplicadas al transmitir al MUV.
 * El generador clínico conserva el validador más amplio (capítulo 23).
 */
export const odontologiaGeneralTransmisionSchema = fevRipsPackageSchema.superRefine((paquete, ctx) => {
  paquete.usuarios.forEach((usuario, userIndex) => {
    const servicios = usuario.servicios ?? {}
    ;(servicios.consultas ?? []).forEach((item, index) => {
      if (!cupsOdontologiaGeneral(item?.codConsulta)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['usuarios', userIndex, 'servicios', 'consultas', index, 'codConsulta'],
          message: 'El CUPS de consulta de odontología general debe terminar en 03 (ejemplo 890203).',
        })
      }
      if (!cie10Valido(item?.codDiagnosticoPrincipal)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['usuarios', userIndex, 'servicios', 'consultas', index, 'codDiagnosticoPrincipal'],
          message: 'El diagnóstico CIE-10 de la consulta es obligatorio y no admite puntos.',
        })
      }
    })
    ;(servicios.procedimientos ?? []).forEach((item, index) => {
      if (!cupsOdontologiaGeneral(item?.codProcedimiento)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['usuarios', userIndex, 'servicios', 'procedimientos', index, 'codProcedimiento'],
          message: 'El CUPS de procedimiento de odontología general debe terminar en 03.',
        })
      }
      if (!cie10Valido(item?.codDiagnosticoPrincipal)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['usuarios', userIndex, 'servicios', 'procedimientos', index, 'codDiagnosticoPrincipal'],
          message: 'El diagnóstico CIE-10 del procedimiento es obligatorio y no admite puntos.',
        })
      }
    })
  })
})

function generateSandboxCuv() {
  const segment = () => randomBytes(4).toString('hex').toUpperCase()
  return `CUV-${segment()}-${segment()}-${segment()}`
}

function glosasToMinistryErrors(glosas) {
  return glosas.map((glosa) => ({
    code: glosa.codigo,
    field: glosa.pathFuente,
    message: glosa.descripcion,
  }))
}

function zodIssuesToGlosas(error) {
  return error.issues.map((issue) => ({
    clase: 'RECHAZADO',
    codigo: 'ZOD',
    descripcion: issue.message,
    pathFuente: issue.path.join('.'),
    fuente: 'zod',
  }))
}

function localIssuesToGlosas(issues) {
  return issues
    .filter((issue) => issue.level === 'error')
    .map((issue) => ({
      clase: 'RECHAZADO',
      codigo: 'LOCAL',
      descripcion: issue.message,
      pathFuente: issue.field ?? null,
      fuente: 'local',
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
          clase: 'RECHAZADO',
          codigo: 'VX-SEXO-EDAD',
          descripcion: 'Inconsistencia edad/sexo vs procedimiento CUPS (validación cruzada simulada).',
          pathFuente: 'servicios.procedimientos.codProcedimiento',
          fuente: 'sandbox',
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
  const ambiente = resolveMuvAmbiente()
  const path = ambiente.cargarPath
  return {
    method: 'POST',
    url: `${ambiente.apiBaseUrl}${path}`,
    path,
    ambiente: ambiente.id,
    serie: ambiente.serie,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      'X-NIT-Prestador': config.minsalud.nit || paquete.numDocumentoIdObligado,
    },
    body: paquete,
  }
}

/**
 * Transmisión FEV-RIPS al MUV: token SISPRO, Zod de odontología general y CUV o glosas.
 */
export class MinSaludService {
  /**
   * @param {{ obtenerToken: Function }} [auth]
   * @param {{ cargarFevRips: Function }} [client]
   */
  constructor(auth = minSaludAuth, client = muvClient) {
    this.auth = auth
    this.client = client
  }

  ambiente() {
    return resolveMuvAmbiente()
  }

  /**
   * @param {object} params
   * @param {object} params.rips
   * @param {object} [params.metadatos]
   * @param {object} [params.credenciales]
   */
  async transmitir({ rips, metadatos = {}, credenciales } = {}) {
    const localIssues = validateRipsPackageLocally(rips, {
      crossValidateAgeSex: true,
      perfilFiscal: metadatos.perfilFiscal,
      esRipsTemporal: metadatos.esRipsTemporal,
      allowNullNumFactura: metadatos.allowNullNumFactura,
    })
    if (hasBlockingValidationErrors(localIssues)) {
      const glosas = localIssuesToGlosas(localIssues)
      return {
        success: false,
        source: 'local',
        localIssues,
        glosas,
        ministryErrors: glosasToMinistryErrors(glosas),
      }
    }

    const estructura = fevRipsPackageSchema.safeParse(rips)
    if (!estructura.success) {
      const glosas = zodIssuesToGlosas(estructura.error)
      return {
        success: false,
        source: 'zod',
        localIssues,
        glosas,
        ministryErrors: glosasToMinistryErrors(glosas),
      }
    }

    const odontologia = odontologiaGeneralTransmisionSchema.safeParse(estructura.data)
    if (!odontologia.success) {
      const glosas = zodIssuesToGlosas(odontologia.error)
      return {
        success: false,
        source: 'zod',
        localIssues,
        glosas,
        ministryErrors: glosasToMinistryErrors(glosas),
      }
    }

    const token = await this.auth.obtenerToken(
      credenciales ?? metadatos.credencialesSispro ?? metadatos.credencialesDescifradas,
    )
    const request = buildCargarFevRipsRequest(odontologia.data, token)
    if (!request.headers.Authorization?.startsWith('Bearer ')) {
      const glosas = [
        {
          clase: 'RECHAZADO',
          codigo: 'AUTH',
          descripcion: 'El token SISPRO es obligatorio para CargarFevRips.',
          pathFuente: 'Authorization',
          fuente: 'auth',
        },
      ]
      return {
        success: false,
        source: 'auth',
        localIssues,
        glosas,
        ministryErrors: glosasToMinistryErrors(glosas),
      }
    }

    const httpResult = await this.postCargarFevRips(request)
    return this.mapMinistryResult(httpResult, localIssues, metadatos, request)
  }

  async postCargarFevRips(request) {
    if (shouldUseMinsaludSandbox()) {
      const glosas = simulateMinistryCrossValidation(request.body)
      if (glosas.length > 0) {
        return {
          ok: false,
          status: 422,
          data: { ResultState: false, resultadosValidacion: glosas },
        }
      }

      return {
        ok: true,
        status: 200,
        data: {
          ResultState: true,
          codigoUnicoValidacion: generateSandboxCuv(),
          ProcesoId: `PROC-${Date.now()}`,
          FechaRadicacion: new Date().toISOString(),
          Estado: 'APROBADO',
        },
      }
    }

    const bearer = String(request.headers.Authorization ?? '').replace(/^Bearer\s+/i, '')
    try {
      const result = await this.client.cargarFevRips(request.body, { token: bearer })
      return {
        ok: true,
        status: 200,
        data: {
          ResultState: true,
          codigoUnicoValidacion: result.cuv,
          ProcesoId: result.procesoId,
          FechaRadicacion: result.fechaRadicacion,
          Estado: result.estado ?? 'APROBADO',
        },
      }
    } catch (error) {
      if (error?.name === 'MuvApiError') {
        return {
          ok: false,
          status: error.status || 502,
          data: {
            ResultState: false,
            message: error.message,
            resultadosValidacion: error.glosas ?? error.details ?? [],
          },
        }
      }
      throw error
    }
  }

  mapMinistryResult(httpResult, localIssues, metadatos, request) {
    const source = shouldUseMinsaludSandbox() ? 'sandbox' : 'minsalud'
    const data = httpResult.data ?? {}
    const cuv = extraerCuv(data)

    if (!httpResult.ok) {
      const glosas = extraerGlosas(data)
      return {
        success: false,
        source,
        httpStatus: httpResult.status,
        endpoint: request.path,
        ambiente: request.ambiente,
        serie: request.serie,
        localIssues,
        glosas,
        ministryErrors: glosasToMinistryErrors(glosas),
        raw: data,
      }
    }

    const approved =
      data.ResultState === true ||
      data.resultState === true ||
      data.estado === 'APROBADO' ||
      Boolean(cuv)

    if (!approved || !cuv) {
      const glosas = extraerGlosas(data)
      return {
        success: false,
        source,
        endpoint: request.path,
        ambiente: request.ambiente,
        serie: request.serie,
        localIssues,
        glosas,
        ministryErrors: glosasToMinistryErrors(glosas),
        raw: data,
      }
    }

    return {
      success: true,
      source,
      endpoint: request.path,
      ambiente: request.ambiente,
      serie: request.serie,
      localIssues: localIssues.filter((issue) => issue.level === 'warning'),
      glosas: [],
      ministryErrors: [],
      cuv,
      procesoId: data.ProcesoId ?? data.procesoId,
      fechaRadicacion: data.FechaRadicacion ?? data.fechaRadicacion ?? new Date().toISOString(),
      estado: data.Estado ?? data.estado ?? 'APROBADO',
      metadatos,
      raw: shouldUseMinsaludSandbox() ? undefined : data,
    }
  }
}

export const minSaludService = new MinSaludService()

/**
 * Valida el JSON con Zod, obtiene el token SISPRO y transmite a CargarFevRips.
 * @param {object} params
 * @param {object} params.rips
 * @param {object} [params.metadatos]
 * @param {object} [params.credenciales]
 */
export async function cargarFevRips(params) {
  return minSaludService.transmitir(params)
}
