import { randomBytes } from 'node:crypto'
import { z } from 'zod'
import { GZIP_UMBRAL_BYTES, interpretarRespuestaCargarFevRips, muvClient } from './muvClient.js'
import { esRechazoTot003 } from '../../shared/ministerioSesion.js'
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
  return randomBytes(48).toString('hex')
}

function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** XML crudo se codifica en Base64. Un string que ya es Base64 se conserva. */
export function codificarXmlFevFile(valor) {
  const texto = String(valor ?? '').trim()
  if (!texto) return ''
  if (texto.startsWith('<')) return Buffer.from(texto, 'utf8').toString('base64')
  return texto
}

/**
 * Paquete 8.2 CargarFevRips: `{ rips, xmlFevFile }`.
 * xmlFevFile es el AttachedDocument de la FEV en Base64.
 */
export function construirPaqueteCargarFevRips({ rips, xmlFevFile, xml, invoice } = {}) {
  const directo = xmlFevFile || xml || invoice?.xmlFevFile || invoice?.xml
  let encoded = codificarXmlFevFile(directo)
  if (!encoded) {
    const numFactura = rips?.numFactura ?? invoice?.numFactura ?? invoice?.invoiceNumber ?? ''
    const nit = rips?.numDocumentoIdObligado ?? invoice?.nitEmisor ?? ''
    const fecha = invoice?.issueDate ?? ''
    const documento = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<AttachedDocument xmlns="urn:oasis:names:specification:ubl:schema:xsd:AttachedDocument-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:ID>${escapeXml(numFactura)}</cbc:ID>
  <cbc:IssueDate>${escapeXml(fecha)}</cbc:IssueDate>
  <cbc:ParentDocumentID>${escapeXml(nit)}</cbc:ParentDocumentID>
  <cbc:DocumentType>Factura electrónica de venta</cbc:DocumentType>
</AttachedDocument>`
    encoded = Buffer.from(documento, 'utf8').toString('base64')
  }
  return { rips, xmlFevFile: encoded }
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

function simulateMinistryCrossValidation(paquete) {
  const errors = []
  const rips = paquete?.rips ?? paquete

  for (const usuario of rips?.usuarios ?? []) {
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

function sesionMinisterioExpirada(httpResult) {
  return Boolean(httpResult?.sesionExpirada) || esRechazoTot003(httpResult?.data)
}

function getAgeYears(birthDate) {
  const born = new Date(birthDate)
  const now = new Date()
  let age = now.getFullYear() - born.getFullYear()
  const monthDiff = now.getMonth() - born.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < born.getDate())) age--
  return age
}

function buildCargarFevRipsRequest(paquete, token, { gzip = false } = {}) {
  const ambiente = resolveMuvAmbiente()
  const path = ambiente.cargarPath
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    Authorization: `Bearer ${token}`,
  }
  if (gzip) headers['Content-Encoding'] = 'gzip'
  return {
    method: 'POST',
    url: `${ambiente.apiBaseUrl}${path}`,
    path,
    ambiente: ambiente.id,
    serie: ambiente.serie,
    gzip,
    headers,
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
   * @param {string} [params.xmlFevFile] AttachedDocument en Base64 o XML crudo
   * @param {string} [params.xml]
   * @param {object} [params.invoice]
   */
  async transmitir({ rips, metadatos = {}, credenciales, xmlFevFile, xml, invoice } = {}) {
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

    const credencialesToken =
      credenciales ?? metadatos.credencialesSispro ?? metadatos.credencialesDescifradas
    let token = await this.auth.obtenerToken(credencialesToken)
    const paquete = construirPaqueteCargarFevRips({
      rips: odontologia.data,
      xmlFevFile: xmlFevFile ?? metadatos.xmlFevFile,
      xml: xml ?? metadatos.xml,
      invoice,
    })
    const gzip =
      Boolean(metadatos.gzip) || Buffer.byteLength(JSON.stringify(paquete)) > GZIP_UMBRAL_BYTES
    let request = buildCargarFevRipsRequest(paquete, token, { gzip })
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

    let httpResult = await this.postCargarFevRips(request)
    if (sesionMinisterioExpirada(httpResult)) {
      this.auth.invalidar?.(credencialesToken)
      token = await this.auth.obtenerToken(credencialesToken)
      request = buildCargarFevRipsRequest(paquete, token, { gzip })
      httpResult = await this.postCargarFevRips(request)
    }
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
          CodigoUnicoValidacion: generateSandboxCuv(),
          ProcesoId: Date.now(),
          NumFactura: request.body?.rips?.numFactura ?? null,
          FechaRadicacion: new Date().toISOString(),
          ResultadosValidacion: [],
        },
      }
    }

    const bearer = String(request.headers.Authorization ?? '').replace(/^Bearer\s+/i, '')
    try {
      const result = await this.client.cargarFevRips(request.body, {
        token: bearer,
        gzip: request.gzip,
      })
      return {
        ok: true,
        status: 200,
        data: result.raw ?? {
          ResultState: true,
          CodigoUnicoValidacion: result.cuv,
          ProcesoId: result.procesoId,
          FechaRadicacion: result.fechaRadicacion,
          ResultadosValidacion: result.notificaciones ?? [],
        },
      }
    } catch (error) {
      if (error?.name === 'MuvApiError') {
        return {
          ok: false,
          status: error.status || 502,
          sesionExpirada: Boolean(error.sesionExpirada) || esRechazoTot003(error),
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
    const lectura = interpretarRespuestaCargarFevRips(data)
    const base = {
      source,
      endpoint: request.path,
      ambiente: request.ambiente,
      serie: request.serie,
      localIssues,
      notificaciones: lectura.notificaciones,
      informes: lectura.informes,
    }

    if (!httpResult.ok || !lectura.success) {
      const glosas = lectura.rechazos.length ? lectura.rechazos : lectura.informes
      return {
        ...base,
        success: false,
        httpStatus: httpResult.status,
        glosas,
        ministryErrors: glosasToMinistryErrors(glosas),
        mensaje: lectura.mensaje,
        error: lectura.mensaje,
        raw: data,
      }
    }

    return {
      ...base,
      success: true,
      localIssues: localIssues.filter((issue) => issue.level === 'warning'),
      glosas: [],
      ministryErrors: [],
      cuv: lectura.cuv,
      procesoId: lectura.procesoId,
      fechaRadicacion: lectura.fechaRadicacion ?? new Date().toISOString(),
      estado: 'APROBADO',
      mensaje: lectura.mensaje,
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
