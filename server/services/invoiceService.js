/**
 * Servicio de facturación electrónica FEV-Salud — capa servidor.
 * Orquesta validación RIPS local, radicación MUV y generación XML DIAN.
 */
import { validateRipsPackage } from './ripsLocalValidator.js'
import { submitRipsToMinistry } from './minsaludRipsClient.js'
import { buildDianHealthInvoiceXml } from './dianFeXmlBuilder.js'
import { saveCuvRecord } from './cuvRepository.js'

/**
 * @param {object} params
 * @param {import('../../src/types/rips').RipsTransaction} params.rips
 * @param {import('../../src/types/ripsCuv').DianInvoicePayload} [params.invoice]
 * @param {object} [params.metadatos]
 */
export async function processElectronicInvoiceSubmission({ rips, invoice, metadatos }) {
  const localIssues = validateRipsPackage(rips)
  const blocking = localIssues.filter((issue) => issue.level === 'error')
  if (blocking.length > 0) {
    return {
      success: false,
      approved: false,
      localIssues,
      error: 'La factura no cumple validaciones locales de RIPS.',
    }
  }

  const ministryResult = await submitRipsToMinistry(rips, { metadatos, invoice })
  if (!ministryResult?.cuv) {
    return {
      success: false,
      approved: false,
      localIssues,
      ministryErrors: ministryResult?.errors ?? [],
      error: ministryResult?.error ?? 'MUV no devolvió CUV.',
    }
  }

  const cuvRecord = await saveCuvRecord({
    cuv: ministryResult.cuv,
    numFactura: rips.numFactura,
    numDocumentoIdObligado: rips.numDocumentoIdObligado,
    status: 'approved',
    procesoId: ministryResult.procesoId,
    fechaRadicacion: ministryResult.fechaRadicacion,
    estado: ministryResult.estado,
    source: ministryResult.source,
    patientUuid: metadatos?.patientUuid ?? null,
    clinicalRecordIds: metadatos?.clinicalRecordIds ?? [],
  })

  let dianXml
  if (invoice) {
    dianXml = buildDianHealthInvoiceXml({
      cuv: ministryResult.cuv,
      numFactura: rips.numFactura,
      nitEmisor: invoice.nitEmisor,
      razonSocialEmisor: invoice.razonSocialEmisor,
      nitAdquiriente: invoice.nitAdquiriente,
      razonSocialAdquiriente: invoice.razonSocialAdquiriente,
      issueDate: invoice.issueDate,
      payableAmount: invoice.payableAmount,
      lines: invoice.lines ?? [],
    })
  }

  return {
    success: true,
    approved: true,
    cuv: ministryResult.cuv,
    cuvRecordId: cuvRecord.id,
    localIssues,
    dianXml,
    source: ministryResult.source,
  }
}
