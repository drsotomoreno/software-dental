import { randomBytes } from 'node:crypto'
import { config, hasMinsaludCredentials } from '../config.js'
import { getMinsaludAccessToken } from './minsaludAuth.js'
import { hasBlockingValidationErrors, validateRipsPackageLocally } from './ripsLocalValidator.js'
import { extractPayableAmountFromXml } from './dianFeXmlBuilder.js'
import { amountsMatchToTheCent, sumRipsVrServicio } from '../../shared/dualValidation.js'

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
 * Envía el paquete RIPS al API REST del Ministerio (MUV) y procesa la respuesta (CUV o glosas).
 * En el flujo FEV, el paquete completo es JSON RIPS (con CUFE) + XML de la factura DIAN.
 * @param {object} params
 * @param {object} params.rips - Paquete JSON RIPS Res. 2275
 * @param {object} [params.metadatos] - Metadatos de trazabilidad (UUID paciente, IDs clínicos)
 * @param {string} [params.facturaXml] - XML FEV ya aprobado por la DIAN
 * @param {object} [params.invoice]
 * @param {boolean} [params.requireCufe=false] - Obligatorio en el flujo de doble validación
 */
export async function submitRipsToMinsalud({
  rips,
  metadatos = {},
  facturaXml = null,
  invoice = null,
  requireCufe = false,
}) {
  const isFullRips = Array.isArray(rips?.usuarios)
  const localIssues = isFullRips
    ? validateRipsPackageLocally(rips, {
        crossValidateAgeSex: true,
        perfilFiscal: metadatos.perfilFiscal,
        esRipsTemporal: metadatos.esRipsTemporal,
        allowNullNumFactura: metadatos.allowNullNumFactura,
      })
    : []
  if (hasBlockingValidationErrors(localIssues)) {
    return {
      success: false,
      source: 'local',
      localIssues,
      ministryErrors: [],
    }
  }

  if (requireCufe && !String(rips?.cufe ?? '').trim()) {
    return {
      success: false,
      source: 'local',
      localIssues,
      ministryErrors: [
        {
          code: 'MUV-SIN-CUFE',
          field: 'cufe',
          message: 'El MUV no puede auditar el paquete: falta el CUFE de la DIAN en el JSON RIPS.',
        },
      ],
    }
  }

  const useSandbox = config.minsalud.sandbox || !hasMinsaludCredentials()

  if (useSandbox) {
    const ministryErrors = [
      ...simulateMinistryCrossValidation(rips),
      ...simulateMuvPackageAudit({ rips, facturaXml, invoice, requireCufe }),
    ]
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
    rips,
    facturaXml: facturaXml ?? undefined,
    xmlFactura: facturaXml ?? undefined,
    metadatos: {
      ...metadatos,
      nitObligado: rips.numDocumentoIdObligado,
      numFactura: rips.numFactura,
      cufe: rips.cufe ?? null,
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

  for (const usuario of rips?.usuarios ?? []) {
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

/**
 * Auditoría sandbox del inspector MUV: CUFE presente y RIPS vs factura al centavo.
 */
function simulateMuvPackageAudit({ rips, facturaXml, invoice, requireCufe }) {
  const errors = []
  if (requireCufe && !String(rips?.cufe ?? '').trim()) {
    errors.push({
      code: 'MUV-SIN-CUFE',
      field: 'cufe',
      message: 'El paquete RIPS no incluye el CUFE emitido por la DIAN.',
    })
  }

  const dianAmount =
    Number(invoice?.payableAmount) ||
    extractPayableAmountFromXml(facturaXml) ||
    Number(rips?.vrTotalDian) ||
    null
  const ripsAmount = sumRipsVrServicio(rips)

  if (dianAmount != null && Number.isFinite(Number(dianAmount)) && (ripsAmount > 0 || dianAmount > 0)) {
    if (!amountsMatchToTheCent(dianAmount, ripsAmount)) {
      errors.push({
        code: 'MUV-GLOSA-CENTAVO',
        field: 'vrServicio',
        message: `El JSON RIPS ($${ripsAmount.toFixed(2)}) no cuadra al centavo con la factura DIAN ($${Number(dianAmount).toFixed(2)}).`,
      })
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

/** Alias histórico usado por invoiceService. */
export const submitRipsToMinistry = submitRipsToMinsalud

