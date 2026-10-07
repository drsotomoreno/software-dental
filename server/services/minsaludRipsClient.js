import { randomBytes } from 'node:crypto'
import { config, hasMinsaludCredentials } from '../config.js'
import { createMuvAuditLogger } from './muv/auditLog.js'
import { cargarFevRips } from './muv/client.js'

const audit = createMuvAuditLogger()
import { hasBlockingValidationErrors, validateRipsPackageLocally } from './ripsLocalValidator.js'

/**
 * Genera CUV simulado para entorno sandbox / desarrollo local.
 */
function generateSandboxCuv() {
  const segment = () => randomBytes(4).toString('hex').toUpperCase()
  return `CUV-${segment()}-${segment()}-${segment()}`
}

/**
 * Envía el paquete FEV-RIPS al MUV y procesa el CUV o los rechazos.
 * @param {object} params
 * @param {object} params.rips
 * @param {object} [params.metadatos]
 * @param {string} [params.xmlFev]
 * @param {string} [params.xmlFevFile]
 */
export async function submitRipsToMinsalud({ rips, metadatos = {}, xmlFev, xmlFevFile }) {
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

  const useSandbox = config.minsalud.sandbox || !hasMinsaludCredentials()

  if (useSandbox) {
    const ministryErrors = simulateMinistryCrossValidation(rips)
    if (ministryErrors.length > 0) {
      audit.record({
        event: 'muv.sandbox',
        approved: false,
        numFactura: rips?.numFactura ?? null,
        rechazos: ministryErrors.map((item) => item.code),
      })
      return {
        success: false,
        source: 'sandbox',
        localIssues,
        ministryErrors,
      }
    }

    const cuv = generateSandboxCuv()
    audit.record({
      event: 'muv.sandbox',
      approved: true,
      numFactura: rips?.numFactura ?? null,
      cuv,
    })
    return {
      success: true,
      source: 'sandbox',
      localIssues: localIssues.filter((i) => i.level === 'warning'),
      cuv,
      procesoId: `PROC-${Date.now()}`,
      fechaRadicacion: new Date().toISOString(),
      estado: 'APROBADO',
      metadatos,
    }
  }

  const ministry = await cargarFevRips({
    rips,
    xmlFev: xmlFev ?? metadatos.xmlFev,
    xmlFevFile: xmlFevFile ?? metadatos.xmlFevFile,
    metadatos,
  })

  return {
    ...ministry,
    source: 'minsalud',
    localIssues: ministry.success ? localIssues.filter((issue) => issue.level === 'warning') : localIssues,
    estado: ministry.success ? 'APROBADO' : 'RECHAZADO',
    fechaRadicacion: ministry.fechaRadicacion ?? new Date().toISOString(),
    metadatos,
  }
}

/**
 * Misma radicación, con la firma que usa el servicio de factura.
 * @param {object} rips
 * @param {{ metadatos?: object, invoice?: object, xmlFev?: string, xmlFevFile?: string }} [options]
 */
export function submitRipsToMinistry(rips, options = {}) {
  return submitRipsToMinsalud({
    rips,
    metadatos: options.metadatos ?? {},
    xmlFev: options.xmlFev ?? options.invoice?.xmlFev ?? options.invoice?.attachedDocument,
    xmlFevFile: options.xmlFevFile ?? options.invoice?.xmlFevFile,
  })
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
