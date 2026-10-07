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
  const cuvRecord = await saveCuvRecord({
    cuv: ministryResult?.cuv,
    numFactura: rips.numFactura,
    numDocumentoIdObligado: rips.numDocumentoIdObligado,
    procesoId: ministryResult?.procesoId,
    fechaRadicacion: ministryResult?.fechaRadicacion,
    estado: ministryResult?.estado,
    source: ministryResult?.source,
    ambiente: ministryResult?.ambiente,
    modulo: ministryResult?.modulo,
    httpStatus: ministryResult?.httpStatus,
    notificaciones: ministryResult?.notificaciones,
    rechazos: ministryResult?.rechazos,
    ministryErrors: ministryResult?.ministryErrors ?? ministryResult?.errors,
    localIssues,
    respuestaCruda: ministryResult?.respuestaCruda,
    rips,
    xmlFev: invoice?.xmlFev ?? invoice?.attachedDocument,
    xmlFevFile: invoice?.xmlFevFile,
    metadatos,
    patientUuid: metadatos?.patientUuid ?? null,
    clinicalRecordId: metadatos?.clinicalRecordIds?.[0] ?? null,
    invoiceId: metadatos?.invoiceId ?? null,
  })
  if (!ministryResult?.cuv) {
    return {
      success: false,
      approved: false,
      localIssues,
      ministryErrors: ministryResult?.errors ?? [],
      error: ministryResult?.error ?? 'MUV no devolvió CUV.',
      estadoCuv: cuvRecord.estado,
      alertas: cuvRecord.alertas,
      cuvRecordId: cuvRecord.id,
    }
  }

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
      codPrestadorReps: invoice.codPrestadorReps,
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
