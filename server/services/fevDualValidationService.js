/**
 * Orquestación estricta FEV-Salud: DIAN (CUFE) → inyección en RIPS → MUV (CUV).
 */
import { submitInvoiceToDian } from './dianFeClient.js'
import { buildDianHealthInvoiceXml, stampCuvOnInvoiceXml } from './dianFeXmlBuilder.js'
import { submitRipsToMinsalud } from './minsaludRipsClient.js'
import { upsertFevTransaction } from './cuvRepository.js'
import { hasBlockingValidationErrors, validateRipsPackageLocally } from './ripsLocalValidator.js'
import {
  ESTADO_DIAN,
  ESTADO_MINSALUD_MUV,
  hasOfficialRipsPackage,
  isListoParaEntrega,
  syncDualValidationAliases,
} from '../../shared/dualValidation.js'
import { normalizeRipsNumFactura } from '../../shared/fiscalProfile.js'

function sumRipsPayable(rips) {
  let total = 0
  for (const usuario of rips?.usuarios ?? []) {
    const servicios = usuario?.servicios ?? {}
    for (const item of servicios.consultas ?? []) total += Number(item.vrServicio ?? 0)
    for (const item of servicios.procedimientos ?? []) total += Number(item.vrServicio ?? 0)
    for (const item of servicios.otrosServicios ?? []) total += Number(item.vrServicio ?? 0)
  }
  return total
}

function firstUsuario(rips) {
  return rips?.usuarios?.[0] ?? {}
}

export function deriveInvoicePayloadFromRips(rips, invoice = {}, metadatos = {}) {
  const usuario = firstUsuario(rips)
  const payable = invoice.payableAmount ?? invoice.amount ?? sumRipsPayable(rips)
  const lines =
    invoice.lines ??
    (usuario.servicios?.procedimientos ?? []).map((item) => ({
      description: item.codProcedimiento || 'Procedimiento odontológico',
      quantity: 1,
      unitPrice: Number(item.vrServicio ?? 0),
      cupsCode: item.codProcedimiento,
    }))
  return {
    nitEmisor: invoice.nitEmisor ?? rips?.numDocumentoIdObligado ?? '',
    razonSocialEmisor:
      invoice.razonSocialEmisor ?? metadatos.razonSocialEmisor ?? 'Prestador de servicios de salud',
    nitAdquiriente:
      invoice.nitAdquiriente ?? usuario.numDocumentoIdentificacion ?? '222222222222',
    razonSocialAdquiriente: invoice.razonSocialAdquiriente ?? 'Adquiriente',
    issueDate: invoice.issueDate ?? new Date().toISOString().slice(0, 10),
    payableAmount: payable,
    lines,
    codPrestadorReps:
      invoice.codPrestadorReps ??
      usuario.servicios?.procedimientos?.[0]?.codPrestador ??
      usuario.servicios?.consultas?.[0]?.codPrestador,
    forceReject: invoice.forceReject,
  }
}

function dualResponse(partial) {
  const synced = syncDualValidationAliases(partial)
  const listoParaEntrega = isListoParaEntrega(synced)
  return {
    ok: listoParaEntrega,
    success: listoParaEntrega,
    approved: listoParaEntrega,
    listoParaEntrega,
    ...synced,
    codigo_cufe: synced.codigo_cufe,
    codigo_cuv: synced.codigo_cuv,
    cufe: synced.codigo_cufe,
    cuv: synced.codigo_cuv,
    cuvRecordId: synced.id ?? synced.cuvRecordId,
  }
}

/**
 * Flujo canónico de doble validación.
 *
 * @param {{ rips?: object, invoice?: object, metadatos?: object, user?: object, options?: object }} params
 */
export async function runFevDualValidation({
  rips,
  invoice,
  metadatos = {},
  user,
  options = {},
} = {}) {
  const mergedMetadatos = {
    ...metadatos,
    clinicId: metadatos.clinicId || user?.clinicId || user?.id || null,
  }
  const numFactura = normalizeRipsNumFactura(
    rips?.numFactura ?? invoice?.numFactura ?? invoice?.invoiceNumber,
  )
  const payloadRips = {
    ...(rips && typeof rips === 'object' ? rips : {}),
    numFactura,
    tipoNota: rips?.tipoNota ?? null,
    numNota: rips?.numNota ?? null,
  }

  const officialRips = hasOfficialRipsPackage(payloadRips)
  if (officialRips) {
    const localIssues = validateRipsPackageLocally(payloadRips, {
      perfilFiscal: mergedMetadatos.perfilFiscal,
      esRipsTemporal: mergedMetadatos.esRipsTemporal,
      allowNullNumFactura: mergedMetadatos.allowNullNumFactura,
      crossValidateAgeSex: true,
    })
    if (hasBlockingValidationErrors(localIssues)) {
      const record = await upsertFevTransaction({
        numFactura,
        numDocumentoIdObligado: payloadRips.numDocumentoIdObligado,
        estado_dian: ESTADO_DIAN.PENDIENTE,
        estado_minsalud_muv: ESTADO_MINSALUD_MUV.PENDIENTE_ENVIO,
        status: 'pending',
        metadatos: mergedMetadatos,
        clinicalRecordIds: mergedMetadatos.clinicalRecordIds ?? [],
        patientUuid: mergedMetadatos.patientUuid ?? null,
      })
      return dualResponse({
        ...record,
        error: 'El RIPS no cumple validaciones locales para generar FEV.',
        localIssues,
        rips: payloadRips,
        route: 'fevDualValidation',
      })
    }
  }

  const invoicePayload = deriveInvoicePayloadFromRips(payloadRips, invoice ?? {}, mergedMetadatos)
  const xmlSinCuv = buildDianHealthInvoiceXml({
    ...invoicePayload,
    cuv: null,
    cufe: null,
    numFactura: numFactura || invoicePayload.issueDate?.replace(/-/g, '') || 'FV0',
  })

  const dianResult = await submitInvoiceToDian({
    xml: xmlSinCuv,
    invoice: invoicePayload,
    numFactura: numFactura || invoice?.invoiceNumber,
    forceReject: options.forceDianReject === true || mergedMetadatos.forceDianReject === true,
    apiKey: options.apiKey ?? mergedMetadatos.apiKey,
  })

  if (!dianResult.success) {
    const record = await upsertFevTransaction({
      numFactura,
      numDocumentoIdObligado: payloadRips.numDocumentoIdObligado,
      estado_dian: ESTADO_DIAN.RECHAZADO,
      estado_minsalud_muv: ESTADO_MINSALUD_MUV.PENDIENTE_ENVIO,
      codigo_cufe: null,
      codigo_cuv: null,
      detalles_rechazo_muv: [],
      status: 'pending',
      metadatos: mergedMetadatos,
      clinicalRecordIds: mergedMetadatos.clinicalRecordIds ?? [],
      patientUuid: mergedMetadatos.patientUuid ?? null,
    })
    return dualResponse({
      ...record,
      error: dianResult.error ?? 'DIAN rechazó la factura.',
      source: dianResult.source,
      dianXml: xmlSinCuv,
      rips: payloadRips,
      route: 'fevDualValidation',
    })
  }

  const ripsConCufe = { ...payloadRips, cufe: dianResult.cufe }
  await upsertFevTransaction({
    numFactura,
    numDocumentoIdObligado: payloadRips.numDocumentoIdObligado,
    estado_dian: ESTADO_DIAN.APROBADO,
    codigo_cufe: dianResult.cufe,
    cufe: dianResult.cufe,
    estado_minsalud_muv: ESTADO_MINSALUD_MUV.PENDIENTE_ENVIO,
    status: 'pending',
    dianXml: dianResult.xml,
    metadatos: mergedMetadatos,
    clinicalRecordIds: mergedMetadatos.clinicalRecordIds ?? [],
    patientUuid: mergedMetadatos.patientUuid ?? null,
  })

  if (!officialRips) {
    const record = await upsertFevTransaction({
      numFactura,
      estado_dian: ESTADO_DIAN.APROBADO,
      codigo_cufe: dianResult.cufe,
      estado_minsalud_muv: ESTADO_MINSALUD_MUV.PENDIENTE_ENVIO,
      status: 'pending',
    })
    return dualResponse({
      ...record,
      source: dianResult.source,
      dianXml: dianResult.xml,
      qrUrl: dianResult.qrUrl,
      rips: ripsConCufe,
      error: 'CUFE legalizado. El CUV queda Pendiente_Envio hasta ensamblar el RIPS oficial.',
      route: 'fevDualValidation',
    })
  }

  const ministryResult = await submitRipsToMinsalud({
    rips: ripsConCufe,
    facturaXml: dianResult.xml,
    cufe: dianResult.cufe,
    requireCufe: true,
    metadatos: mergedMetadatos,
  })

  if (!ministryResult.success) {
    const glosas = ministryResult.ministryErrors ?? []
    const record = await upsertFevTransaction({
      numFactura,
      numDocumentoIdObligado: payloadRips.numDocumentoIdObligado,
      estado_dian: ESTADO_DIAN.APROBADO,
      codigo_cufe: dianResult.cufe,
      cufe: dianResult.cufe,
      estado_minsalud_muv: ESTADO_MINSALUD_MUV.RECHAZADO_CON_GLOSAS,
      codigo_cuv: null,
      detalles_rechazo_muv: glosas,
      status: 'rejected',
      dianXml: dianResult.xml,
      metadatos: { ...mergedMetadatos, ...ministryResult.metadatos },
      clinicalRecordIds: mergedMetadatos.clinicalRecordIds ?? [],
      patientUuid: mergedMetadatos.patientUuid ?? null,
    })
    return dualResponse({
      ...record,
      error: 'MUV rechazó el RIPS con glosas. El CUFE DIAN se conserva.',
      source: ministryResult.source,
      localIssues: ministryResult.localIssues ?? [],
      ministryErrors: glosas,
      dianXml: dianResult.xml,
      qrUrl: dianResult.qrUrl,
      rips: ripsConCufe,
      route: 'fevDualValidation',
    })
  }

  const deliveryXml = stampCuvOnInvoiceXml(dianResult.xml, ministryResult.cuv)
  const ripsFinal = { ...ripsConCufe, cuv: ministryResult.cuv }
  const record = await upsertFevTransaction({
    numFactura,
    numDocumentoIdObligado: payloadRips.numDocumentoIdObligado,
    estado_dian: ESTADO_DIAN.APROBADO,
    codigo_cufe: dianResult.cufe,
    cufe: dianResult.cufe,
    estado_minsalud_muv: ESTADO_MINSALUD_MUV.APROBADO,
    codigo_cuv: ministryResult.cuv,
    cuv: ministryResult.cuv,
    detalles_rechazo_muv: [],
    status: 'approved',
    procesoId: ministryResult.procesoId,
    fechaRadicacion: ministryResult.fechaRadicacion,
    estado: ministryResult.estado,
    source: ministryResult.source,
    dianXml: deliveryXml,
    metadatos: { ...mergedMetadatos, ...ministryResult.metadatos },
    clinicalRecordIds: mergedMetadatos.clinicalRecordIds ?? [],
    patientUuid: mergedMetadatos.patientUuid ?? null,
  })

  return dualResponse({
    ...record,
    source: ministryResult.source,
    procesoId: ministryResult.procesoId,
    fechaRadicacion: ministryResult.fechaRadicacion,
    estado: ministryResult.estado,
    localIssues: ministryResult.localIssues ?? [],
    dianXml: deliveryXml,
    qrUrl: dianResult.qrUrl,
    rips: ripsFinal,
    cuvRecordId: record.id,
    route: 'fevDualValidation',
  })
}
