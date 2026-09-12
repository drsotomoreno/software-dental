/**
 * Servicio de facturación electrónica FEV-Salud — capa servidor.
 * Orquesta el flujo de doble validación: DIAN (CUFE) → RIPS → MUV (CUV).
 */
import { ejecutarFlujoDobleValidacion } from './dualValidationBilling.js'
import { hasBlockingValidationErrors, validateRipsPackageLocally } from './ripsLocalValidator.js'

/**
 * @param {object} params
 * @param {import('../../src/types/rips').RipsTransaction} params.rips
 * @param {import('../../src/types/ripsCuv').DianInvoicePayload} [params.invoice]
 * @param {object} [params.metadatos]
 */
export async function processElectronicInvoiceSubmission({ rips, invoice, metadatos }) {
  const localIssues = validateRipsPackageLocally(rips)
  const blocking = hasBlockingValidationErrors(localIssues)
  if (blocking) {
    return {
      success: false,
      approved: false,
      legalizada: false,
      localIssues,
      error: 'La factura no cumple validaciones locales de RIPS.',
    }
  }

  const result = await ejecutarFlujoDobleValidacion({ rips, invoice, metadatos })
  return {
    ...result,
    success: result.legalizada === true,
    approved: result.legalizada === true,
    cuv: result.codigo_cuv ?? null,
    cufe: result.codigo_cufe ?? null,
    cuvRecordId: result.cuvRecordId,
    localIssues: result.localIssues ?? localIssues,
    ministryErrors: result.ministryErrors ?? result.detalles_rechazo_muv ?? [],
    dianXml: result.dianXml,
    error: result.error,
  }
}
