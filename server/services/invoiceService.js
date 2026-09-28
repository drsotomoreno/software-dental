/**
 * Servicio de facturación electrónica FEV-Salud — capa servidor.
 * Sigue el flujo oficial: SISPRO → CUV → CUFE/pdfUrl.
 */
import { ejecutarFlujoOficial } from '../controllers/ripsMotor.controller.js'

/**
 * @param {object} params
 * @param {import('../../src/types/rips').RipsTransaction} params.rips
 * @param {import('../../src/types/ripsCuv').DianInvoicePayload} [params.invoice]
 * @param {object} [params.metadatos]
 */
export async function processElectronicInvoiceSubmission({ rips, invoice, metadatos }) {
  const flujo = await ejecutarFlujoOficial({ rips, invoice, metadatos })
  if (!flujo.success) {
    return {
      success: false,
      approved: false,
      localIssues: flujo.localIssues ?? [],
      ministryErrors: flujo.ministryErrors ?? [],
      error: flujo.error ?? 'MUV no devolvió CUV.',
      cuv: flujo.cuv,
    }
  }

  return {
    success: true,
    approved: true,
    status: flujo.status,
    cuv: flujo.cuv,
    cufe: flujo.cufe,
    pdfUrl: flujo.pdfUrl,
    cuvRecordId: flujo.cuvRecordId,
    localIssues: flujo.localWarnings ?? [],
    dianXml: flujo.dianXml,
    source: flujo.source,
    provider: flujo.provider,
  }
}
