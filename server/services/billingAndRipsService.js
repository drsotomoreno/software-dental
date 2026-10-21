/**
 * Orquestación FEV / RIPS según perfil fiscal del prestador.
 * Con FEV: numFactura oficial y CUFE. Sin FEV: RC- del no obligado, o null si la atención vale 0.
 */
import { submitRipsToMinsalud } from './minsaludRipsClient.js'
import { buildDianHealthInvoiceXml } from './dianFeXmlBuilder.js'
import { saveCuvRecord } from './cuvRepository.js'
import { saveTemporaryRipsRecord } from './ripsTemporalStore.js'
import { hasBlockingValidationErrors, validateRipsPackageLocally } from './ripsLocalValidator.js'
import {
  normalizePerfilFiscal,
  normalizeRipsNumFactura,
  PERFIL_FISCAL_NO_OBLIGADO,
  PERFIL_FISCAL_OBLIGADO_FEV,
} from '../../shared/fiscalProfile.js'
import {
  FLUJO_RIPS_CON_FEV,
  FLUJO_RIPS_SIN_FEV_CERO,
  FLUJO_RIPS_SIN_FEV_RECIBO,
  isNumeroFevOficial,
  isNumeroReciboCaja,
  resolveRipsCobroFlujo,
  sumVrServicioRips,
} from '../../shared/ripsCobroFlow.js'

function uniqueCodes(values) {
  return [...new Set(values.map((value) => String(value ?? '').trim()).filter(Boolean))]
}

/**
 * Extrae CIE-10 y CUPS del paquete RIPS (consultas y procedimientos).
 * @param {object} [rips]
 * @returns {{ cie10: string[], cups: string[] }}
 */
export function extractCie10AndCupsFromRips(rips) {
  const cie10 = []
  const cups = []
  for (const usuario of rips?.usuarios ?? []) {
    for (const consulta of usuario.servicios?.consultas ?? []) {
      cie10.push(consulta.codDiagnosticoPrincipal)
      cups.push(consulta.codConsulta)
    }
    for (const procedimiento of usuario.servicios?.procedimientos ?? []) {
      cie10.push(procedimiento.codDiagnosticoPrincipal)
      cups.push(procedimiento.codProcedimiento)
    }
  }
  return { cie10: uniqueCodes(cie10), cups: uniqueCodes(cups) }
}

/**
 * Une códigos del RIPS con los que envió el motor de dictado.
 * @param {object} [rips]
 * @param {{ cie10?: unknown[], cups?: unknown[], clinicalItems?: Array<{ cie10Code?: unknown, cupsCode?: unknown }> }} [extracted]
 */
export function collectExtractedCodes(rips, extracted = {}) {
  const fromRips = extractCie10AndCupsFromRips(rips)
  const fromItems = extracted.clinicalItems ?? []
  return {
    cie10: uniqueCodes([
      ...fromRips.cie10,
      ...(extracted.cie10 ?? []),
      ...fromItems.map((item) => item?.cie10Code),
    ]),
    cups: uniqueCodes([
      ...fromRips.cups,
      ...(extracted.cups ?? []),
      ...fromItems.map((item) => item?.cupsCode),
    ]),
  }
}

export function hasExtractedCie10AndCups(codes) {
  return Boolean(codes?.cie10?.length && codes?.cups?.length)
}

function stampNumFactura(rips, numFactura) {
  return {
    ...(rips && typeof rips === 'object' ? rips : {}),
    numFactura,
    tipoNota: rips?.tipoNota ?? null,
    numNota: rips?.numNota ?? null,
  }
}

/**
 * Prestador obligado a FEV: valida, radica RIPS y genera XML FEV-Salud.
 * @param {{ rips: object, invoice?: object, metadatos?: object, user?: object }} params
 */
export async function generarFEV_y_RIPS({ rips, invoice, metadatos = {}, user }) {
  const perfilFiscal = PERFIL_FISCAL_OBLIGADO_FEV
  const numFactura = normalizeRipsNumFactura(rips?.numFactura ?? invoice?.invoiceNumber ?? invoice?.numFactura)
  const cufe = String(invoice?.cufe ?? metadatos?.cufe ?? rips?.cufe ?? '').trim()
  const referencia = normalizeRipsNumFactura(invoice?.invoiceNumber ?? invoice?.numFactura ?? metadatos?.fevReferencia)
  if (!isNumeroFevOficial(numFactura) || !cufe || (referencia && referencia !== numFactura)) {
    return {
      ok: false,
      success: false,
      route: 'generarFEV_y_RIPS',
      perfilFiscal,
      error: 'La FEV exige numFactura oficial, CUFE y cruce 1:1 con el número reportado a la DIAN.',
      localIssues: [
        {
          level: 'error',
          field: 'numFactura',
          message: 'La FEV exige numFactura oficial, CUFE y cruce 1:1 con el número reportado a la DIAN.',
        },
      ],
    }
  }
  const payload = {
    ...rips,
    numFactura,
    cufe,
  }
  const mergedMetadatos = {
    ...metadatos,
    perfilFiscal,
    esRipsTemporal: false,
    emisionVoluntaria: metadatos.emisionVoluntaria === true,
    cufe,
    fevReferencia: numFactura,
    clinicId: metadatos.clinicId || user?.clinicId || user?.id || null,
  }

  const localIssues = validateRipsPackageLocally(payload, {
    perfilFiscal,
    esRipsTemporal: false,
    flujoRips: FLUJO_RIPS_CON_FEV,
    emisionVoluntaria: true,
    cufe,
    fevReferencia: numFactura,
    valorAtencion: metadatos.valorAtencion ?? sumVrServicioRips(payload),
    crossValidateAgeSex: true,
  })
  if (hasBlockingValidationErrors(localIssues)) {
    return {
      ok: false,
      success: false,
      route: 'generarFEV_y_RIPS',
      perfilFiscal,
      error: 'El RIPS no cumple validaciones locales para generar FEV.',
      localIssues,
    }
  }

  const ministryResult = await submitRipsToMinsalud({ rips: payload, metadatos: mergedMetadatos })
  if (!ministryResult.success) {
    return {
      ok: false,
      success: false,
      route: 'generarFEV_y_RIPS',
      perfilFiscal,
      error: 'No se pudo radicar el RIPS ante MinSalud.',
      localIssues: ministryResult.localIssues ?? localIssues,
      ministryErrors: ministryResult.ministryErrors ?? [],
      source: ministryResult.source,
    }
  }

  const cuvRecord = await saveCuvRecord({
    cuv: ministryResult.cuv,
    numFactura: payload.numFactura,
    numDocumentoIdObligado: payload.numDocumentoIdObligado,
    status: 'approved',
    procesoId: ministryResult.procesoId,
    fechaRadicacion: ministryResult.fechaRadicacion,
    estado: ministryResult.estado,
    source: ministryResult.source,
    metadatos: { ...mergedMetadatos, ...ministryResult.metadatos },
    clinicalRecordIds: mergedMetadatos.clinicalRecordIds ?? [],
    patientUuid: mergedMetadatos.patientUuid ?? null,
  })

  let dianXml = null
  if (invoice) {
    dianXml = buildDianHealthInvoiceXml({
      cuv: ministryResult.cuv,
      numFactura: payload.numFactura,
      nitEmisor: invoice.nitEmisor,
      razonSocialEmisor: invoice.razonSocialEmisor,
      nitAdquiriente: invoice.nitAdquiriente,
      razonSocialAdquiriente: invoice.razonSocialAdquiriente,
      issueDate: invoice.issueDate,
      payableAmount: invoice.payableAmount,
      lines: invoice.lines ?? [],
      codPrestadorReps: invoice.codPrestadorReps,
    })
    cuvRecord.dianXmlGenerated = true
  }

  return {
    ok: true,
    success: true,
    approved: true,
    route: 'generarFEV_y_RIPS',
    perfilFiscal,
    numFactura: payload.numFactura,
    cuv: ministryResult.cuv,
    cuvRecordId: cuvRecord.id,
    procesoId: ministryResult.procesoId,
    fechaRadicacion: ministryResult.fechaRadicacion,
    estado: ministryResult.estado,
    source: ministryResult.source,
    localIssues: ministryResult.localIssues ?? [],
    dianXml,
    rips: payload,
  }
}

/**
 * Prestador no obligado: RIPS pendiente de envío mensual, sin factura.
 * @param {{ rips: object, metadatos?: object, user?: object }} params
 */
export async function guardarRIPS_Pendiente({ rips, metadatos = {}, user }) {
  const perfilFiscal = PERFIL_FISCAL_NO_OBLIGADO
  const valorAtencion = metadatos.valorAtencion ?? sumVrServicioRips(rips)
  const flujo = resolveRipsCobroFlujo({
    perfilFiscal,
    valorAtencion,
    atencionCero: metadatos.atencionCero === true || (valorAtencion != null && valorAtencion <= 0),
    emisionVoluntaria: false,
  })
  if (flujo === FLUJO_RIPS_CON_FEV) {
    return {
      ok: false,
      success: false,
      route: 'guardarRIPS_Pendiente',
      perfilFiscal,
      error: 'Este cobro corresponde a FEV. No se guarda como RIPS sin factura.',
    }
  }
  const numero = normalizeRipsNumFactura(rips?.numFactura)
  if (flujo === FLUJO_RIPS_SIN_FEV_RECIBO && !isNumeroReciboCaja(numero)) {
    return {
      ok: false,
      success: false,
      route: 'guardarRIPS_Pendiente',
      perfilFiscal,
      error: 'El no obligado con cobro requiere numFactura igual al recibo RC-XXXXX.',
      localIssues: [
        {
          level: 'error',
          field: 'numFactura',
          message: 'El no obligado con cobro requiere numFactura igual al recibo RC-XXXXX.',
        },
      ],
    }
  }
  if (String(rips?.cufe ?? metadatos?.cufe ?? '').trim()) {
    return {
      ok: false,
      success: false,
      route: 'guardarRIPS_Pendiente',
      perfilFiscal,
      error: 'El RIPS sin FEV no lleva CUFE.',
    }
  }
  const numFactura = flujo === FLUJO_RIPS_SIN_FEV_CERO ? null : numero
  const payload = stampNumFactura(rips, numFactura)
  const clinicId = String(metadatos.clinicId || user?.clinicId || user?.id || '').trim()

  const localIssues = validateRipsPackageLocally(payload, {
    perfilFiscal,
    esRipsTemporal: flujo === FLUJO_RIPS_SIN_FEV_CERO,
    atencionCero: flujo === FLUJO_RIPS_SIN_FEV_CERO,
    valorAtencion: valorAtencion ?? (flujo === FLUJO_RIPS_SIN_FEV_CERO ? 0 : undefined),
    flujoRips: flujo,
    crossValidateAgeSex: true,
  })
  if (hasBlockingValidationErrors(localIssues)) {
    return {
      ok: false,
      success: false,
      route: 'guardarRIPS_Pendiente',
      perfilFiscal,
      error: 'El RIPS pendiente no cumple validaciones locales.',
      localIssues,
    }
  }

  const record = await saveTemporaryRipsRecord({
    clinicId,
    patientId: metadatos.patientUuid ?? metadatos.patientId ?? null,
    professionalId: metadatos.professionalId ?? user?.id ?? null,
    clinicalRecordId: Array.isArray(metadatos.clinicalRecordIds)
      ? metadatos.clinicalRecordIds[0]
      : metadatos.clinicalRecordId ?? null,
    numDocumentoIdObligado: payload.numDocumentoIdObligado,
    numFactura,
    perfilFiscal,
    status: 'pendiente',
    ripsJson: payload,
  })

  return {
    ok: true,
    success: true,
    route: 'guardarRIPS_Pendiente',
    perfilFiscal,
    numFactura,
    pendingRips: record,
    message:
      flujo === FLUJO_RIPS_SIN_FEV_CERO
        ? 'Atención a $0. El RIPS se radica sin FEV y sin recibo.'
        : 'RIPS del no obligado con el recibo de caja, sin CUFE.',
    rips: payload,
  }
}

/**
 * FEV (obligado o emisión voluntaria, valor > 0) cruza CUFE.
 * Sin FEV: recibo RC- del no obligado, o null si la atención vale 0.
 * @param {{ perfilFiscal?: unknown, rips: object, invoice?: object, metadatos?: object, user?: object }} params
 */
export async function enrutarPorPerfilFiscal({ perfilFiscal, rips, invoice, metadatos, user }) {
  const resolved = normalizePerfilFiscal(perfilFiscal ?? user?.perfilFiscal)
  const valorAtencion = metadatos?.valorAtencion ?? sumVrServicioRips(rips)
  const flujo = resolveRipsCobroFlujo({
    perfilFiscal: resolved,
    valorAtencion,
    atencionCero: metadatos?.atencionCero === true,
    emisionVoluntaria: metadatos?.emisionVoluntaria === true || Boolean(invoice),
  })
  const contexto = {
    ...(metadatos ?? {}),
    valorAtencion,
    perfilFiscal: resolved,
    emisionVoluntaria: flujo === FLUJO_RIPS_CON_FEV,
  }

  if (flujo === FLUJO_RIPS_CON_FEV) {
    return generarFEV_y_RIPS({ rips, invoice, metadatos: contexto, user })
  }

  return guardarRIPS_Pendiente({ rips, metadatos: contexto, user })
}

/**
 * @param {object} params
 * @param {object} params.rips
 * @param {object} [params.invoice]
 * @param {object} [params.metadatos]
 */
export async function processClinicalSessionOnServer({ rips, invoice, metadatos }) {
  return enrutarPorPerfilFiscal({
    perfilFiscal: metadatos?.perfilFiscal,
    rips,
    invoice,
    metadatos,
  })
}
