/**
 * Orquestación de doble validación FEV-Salud:
 *   Paso 1  Enviar XML a la DIAN
 *   Paso 2  Recibir CUFE
 *   Paso 3  Inyectar CUFE en el JSON RIPS
 *   Paso 4  Enviar paquete (RIPS JSON + XML factura) al MUV
 *   Paso 5  Guardar CUV si aprueba, o glosas si rechaza
 *
 * Sin CUV la transacción clínica no está legalizada, aunque la DIAN haya emitido CUFE.
 */
import { saveCuvRecord } from './cuvRepository.js'
import { buildDianHealthInvoiceXml, stampCufeInInvoiceXml } from './dianFeXmlBuilder.js'
import { submitInvoiceXmlToDian } from './dianInvoiceClient.js'
import { getInvoiceTransaction, saveInvoiceTransaction } from './invoiceTransactionStore.js'
import { submitRipsToMinsalud } from './minsaludRipsClient.js'
import { hasBlockingValidationErrors, validateRipsPackageLocally } from './ripsLocalValidator.js'
import {
  ESTADO_DIAN,
  ESTADO_MUV,
  injectCufeIntoRips,
  isTransactionLegalizada,
} from '../../shared/dualValidation.js'

function resolveNumFactura(rips, invoice) {
  return (
    invoice?.numFactura ||
    invoice?.invoiceNumber ||
    rips?.numFactura ||
    null
  )
}

function buildXmlFromInvoice(invoice, rips, { cuv = null, cufe = null } = {}) {
  const numFactura = resolveNumFactura(rips, invoice)
  if (!invoice || !numFactura) {
    throw new Error('Se requiere la factura (XML/payload) y numFactura para el envío a la DIAN.')
  }
  return buildDianHealthInvoiceXml({
    cuv,
    cufe,
    requireCuv: false,
    numFactura,
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

function baseTransaction(existing, { rips, invoice, metadatos }) {
  return {
    ...(existing ?? {}),
    numFactura: resolveNumFactura(rips, invoice),
    numDocumentoIdObligado: rips?.numDocumentoIdObligado ?? invoice?.nitEmisor ?? null,
    payableAmount: invoice?.payableAmount ?? existing?.payableAmount ?? null,
    metadatos: { ...(existing?.metadatos ?? {}), ...(metadatos ?? {}) },
    rips,
  }
}

/**
 * Ejecuta el flujo estricto DIAN → CUFE → RIPS → MUV → CUV.
 * Si la DIAN ya aprobó (reintento tras glosas MUV), omite los pasos 1–2.
 *
 * @param {{ rips: object, invoice?: object, metadatos?: object, transactionId?: string }} params
 * @param {object} [deps] - Inyección para pruebas
 */
export async function ejecutarFlujoDobleValidacion(
  { rips, invoice, metadatos = {}, transactionId } = {},
  deps = {},
) {
  const sendDian = deps.submitInvoiceXmlToDian ?? submitInvoiceXmlToDian
  const sendMuv = deps.submitRipsToMinsalud ?? submitRipsToMinsalud
  const persist = deps.saveInvoiceTransaction ?? saveInvoiceTransaction
  const load = deps.getInvoiceTransaction ?? getInvoiceTransaction
  const persistCuv = deps.saveCuvRecord ?? saveCuvRecord
  const buildXml = deps.buildDianHealthInvoiceXml ?? buildXmlFromInvoice

  const numFactura = resolveNumFactura(rips, invoice)
  const existing = await load({
    id: transactionId ?? metadatos.transactionId,
    numFactura,
  })

  let transaction = baseTransaction(existing, { rips, invoice, metadatos })
  if (!transaction.estado_dian) transaction.estado_dian = ESTADO_DIAN.PENDIENTE
  if (!transaction.estado_muv) transaction.estado_muv = ESTADO_MUV.PENDIENTE_ENVIO
  if (!Array.isArray(transaction.detalles_rechazo_muv)) transaction.detalles_rechazo_muv = []

  const isFullRips = Array.isArray(rips?.usuarios)
  const localIssues = isFullRips
    ? validateRipsPackageLocally(rips, {
        perfilFiscal: metadatos.perfilFiscal,
        esRipsTemporal: metadatos.esRipsTemporal,
        allowNullNumFactura: metadatos.allowNullNumFactura,
        crossValidateAgeSex: true,
      })
    : []

  if (hasBlockingValidationErrors(localIssues)) {
    transaction = await persist({
      ...transaction,
      status: 'rejected',
      estado_muv: ESTADO_MUV.PENDIENTE_ENVIO,
    })
    return {
      ok: false,
      success: false,
      legalizada: false,
      failedStep: 'rips_local',
      error: 'El RIPS no cumple validaciones locales.',
      localIssues,
      estado_dian: transaction.estado_dian,
      codigo_cufe: transaction.codigo_cufe ?? null,
      estado_muv: transaction.estado_muv,
      codigo_cuv: null,
      detalles_rechazo_muv: [],
      transaction,
      rips,
    }
  }

  let dianXml = transaction.dianXml ?? null
  let cufe = String(transaction.codigo_cufe ?? rips?.cufe ?? '').trim() || null
  const dianAlreadyApproved = transaction.estado_dian === ESTADO_DIAN.APROBADO && Boolean(cufe)

  // --- Pasos 1 y 2: XML → DIAN → CUFE ---
  if (!dianAlreadyApproved) {
    try {
      dianXml = buildXml(invoice, rips, { cufe, cuv: transaction.codigo_cuv })
    } catch (error) {
      transaction = await persist({
        ...transaction,
        estado_dian: ESTADO_DIAN.RECHAZADO,
        codigo_cufe: null,
        status: 'rejected',
        dianErrors: [{ message: error instanceof Error ? error.message : String(error) }],
      })
      return {
        ok: false,
        success: false,
        legalizada: false,
        failedStep: 'dian',
        error: error instanceof Error ? error.message : 'No se pudo construir el XML DIAN.',
        estado_dian: ESTADO_DIAN.RECHAZADO,
        codigo_cufe: null,
        estado_muv: ESTADO_MUV.PENDIENTE_ENVIO,
        codigo_cuv: null,
        detalles_rechazo_muv: [],
        transaction,
        rips,
      }
    }

    const dianResult = await sendDian({ xml: dianXml, invoice: { ...invoice, numFactura }, metadatos })
    if (!dianResult?.success || !String(dianResult.cufe ?? '').trim()) {
      const dianErrors = dianResult?.errors ?? [{ message: 'La DIAN no devolvió CUFE.' }]
      transaction = await persist({
        ...transaction,
        estado_dian: ESTADO_DIAN.RECHAZADO,
        codigo_cufe: null,
        status: 'rejected',
        dianXml,
        dianErrors,
      })
      return {
        ok: false,
        success: false,
        legalizada: false,
        failedStep: 'dian',
        error: 'La DIAN rechazó la factura. No se envía el paquete al MUV.',
        dianErrors,
        estado_dian: ESTADO_DIAN.RECHAZADO,
        codigo_cufe: null,
        estado_muv: ESTADO_MUV.PENDIENTE_ENVIO,
        codigo_cuv: null,
        detalles_rechazo_muv: [],
        dianXml,
        transaction,
        rips,
        source: dianResult?.source,
      }
    }

    cufe = String(dianResult.cufe).trim()
    dianXml = stampCufeInInvoiceXml(dianXml, cufe)
    transaction = await persist({
      ...transaction,
      estado_dian: ESTADO_DIAN.APROBADO,
      codigo_cufe: cufe,
      status: 'dian_sent',
      dianXml,
      dianErrors: [],
    })
  } else if (dianXml && cufe) {
    dianXml = stampCufeInInvoiceXml(dianXml, cufe)
  }

  // --- Paso 3: ensamblaje RIPS con CUFE ---
  let ripsConCufe
  try {
    ripsConCufe = injectCufeIntoRips(rips, cufe)
  } catch (error) {
    transaction = await persist({
      ...transaction,
      estado_muv: ESTADO_MUV.PENDIENTE_ENVIO,
    })
    return {
      ok: false,
      success: false,
      legalizada: false,
      failedStep: 'rips_cufe',
      error: error instanceof Error ? error.message : 'No se pudo inyectar el CUFE en el RIPS.',
      estado_dian: ESTADO_DIAN.APROBADO,
      codigo_cufe: cufe,
      estado_muv: ESTADO_MUV.PENDIENTE_ENVIO,
      codigo_cuv: null,
      detalles_rechazo_muv: [],
      dianXml,
      transaction,
      rips,
    }
  }

  // --- Pasos 4 y 5: paquete completo al MUV ---
  const muvResult = await sendMuv({
    rips: ripsConCufe,
    metadatos: { ...metadatos, cufe, numFactura },
    facturaXml: dianXml,
    invoice: { ...invoice, numFactura, payableAmount: invoice?.payableAmount },
    requireCufe: true,
  })

  if (!muvResult?.success || !String(muvResult.cuv ?? '').trim()) {
    const glosas = muvResult?.ministryErrors ?? [
      { message: muvResult?.error ?? 'El MUV rechazó el paquete. No hay CUV.' },
    ]
    transaction = await persist({
      ...transaction,
      rips: ripsConCufe,
      dianXml,
      estado_dian: ESTADO_DIAN.APROBADO,
      codigo_cufe: cufe,
      estado_muv: ESTADO_MUV.RECHAZADO_POR_MUV,
      codigo_cuv: null,
      detalles_rechazo_muv: glosas,
      status: 'rejected',
    })
    return {
      ok: false,
      success: false,
      legalizada: false,
      failedStep: 'muv',
      error: 'El MUV rechazó el paquete. La transacción queda en corrección (hay CUFE, no hay CUV).',
      localIssues: muvResult?.localIssues ?? localIssues,
      ministryErrors: glosas,
      estado_dian: ESTADO_DIAN.APROBADO,
      codigo_cufe: cufe,
      estado_muv: ESTADO_MUV.RECHAZADO_POR_MUV,
      codigo_cuv: null,
      detalles_rechazo_muv: glosas,
      dianXml,
      transaction,
      rips: ripsConCufe,
      source: muvResult?.source,
    }
  }

  const cuv = String(muvResult.cuv).trim()
  const cuvRecord = await persistCuv({
    cuv,
    numFactura,
    numDocumentoIdObligado: ripsConCufe.numDocumentoIdObligado,
    status: 'approved',
    procesoId: muvResult.procesoId,
    fechaRadicacion: muvResult.fechaRadicacion,
    estado: muvResult.estado,
    source: muvResult.source,
    metadatos: { ...metadatos, cufe, ...muvResult.metadatos },
    clinicalRecordIds: metadatos.clinicalRecordIds ?? [],
    patientUuid: metadatos.patientUuid ?? null,
  })

  transaction = await persist({
    ...transaction,
    rips: ripsConCufe,
    dianXml,
    estado_dian: ESTADO_DIAN.APROBADO,
    codigo_cufe: cufe,
    estado_muv: ESTADO_MUV.APROBADO_CON_CUV,
    codigo_cuv: cuv,
    detalles_rechazo_muv: [],
    status: 'cuv_approved',
    cuvRecordId: cuvRecord?.id ?? null,
  })

  return {
    ok: true,
    success: true,
    approved: true,
    legalizada: isTransactionLegalizada(transaction),
    failedStep: null,
    estado_dian: ESTADO_DIAN.APROBADO,
    codigo_cufe: cufe,
    estado_muv: ESTADO_MUV.APROBADO_CON_CUV,
    codigo_cuv: cuv,
    detalles_rechazo_muv: [],
    cuv,
    cufe,
    cuvRecordId: cuvRecord?.id ?? null,
    procesoId: muvResult.procesoId,
    fechaRadicacion: muvResult.fechaRadicacion,
    estado: muvResult.estado,
    source: muvResult.source,
    localIssues: muvResult.localIssues ?? [],
    dianXml,
    transaction,
    rips: ripsConCufe,
  }
}

export { injectCufeIntoRips }
