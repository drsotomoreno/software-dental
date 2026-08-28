/**
 * Capa servidor — orquestación Billing + RIPS (Colombia).
 * Delega validación local y radicación MUV al pipeline existente.
 */
import { processElectronicInvoiceSubmission } from './invoiceService.js'

/**
 * Procesa una sesión clínica: RIPS obligatorio, FEV DIAN solo si es facturable.
 *
 * @param {object} params
 * @param {object} params.rips — RipsTransaction JSON
 * @param {object} [params.invoice] — DianInvoicePayload (omitir si sesión $0 / no facturable)
 * @param {object} [params.metadatos]
 */
export async function processClinicalSessionOnServer({ rips, invoice, metadatos }) {
  return processElectronicInvoiceSubmission({ rips, invoice, metadatos })
}
