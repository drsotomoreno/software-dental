/**
 * Servicio de facturación electrónica FEV-Salud — capa servidor.
 * Delega en el orquestador dual CUFE (DIAN) → CUV (MinSalud MUV).
 */
import { runFevDualValidation } from './fevDualValidationService.js'

/**
 * @param {object} params
 * @param {import('../../src/types/rips').RipsTransaction} params.rips
 * @param {import('../../src/types/ripsCuv').DianInvoicePayload} [params.invoice]
 * @param {object} [params.metadatos]
 */
export async function processElectronicInvoiceSubmission({ rips, invoice, metadatos, user, options }) {
  return runFevDualValidation({ rips, invoice, metadatos, user, options })
}
