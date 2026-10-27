/**
 * Orquestación FEV / RIPS según perfil fiscal y vínculo de la atención.
 * Obligado con factura electrónica genera FEV+RIPS.
 * Recibo de caja interno, atención en $0 o un paquete sin número de FEV
 * radican RIPS sin factura (numFactura null).
 * No_Obligado guarda RIPS pendiente con numFactura = null.
 */
import { submitRipsToMinsalud } from './minsaludRipsClient.js'
import { buildDianHealthInvoiceXml } from './dianFeXmlBuilder.js'
import { saveCuvRecord } from './cuvRepository.js'
import { saveTemporaryRipsRecord } from './ripsTemporalStore.js'
import { hasBlockingValidationErrors, validateRipsPackageLocally } from './ripsLocalValidator.js'
import {
  isObligadoFev,
  normalizePerfilFiscal,
  normalizeRipsNumFactura,
  PERFIL_FISCAL_NO_OBLIGADO,
  PERFIL_FISCAL_OBLIGADO_FEV,
} from '../../shared/fiscalProfile.js'

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
  const payload = {
    ...rips,
    numFactura: normalizeRipsNumFactura(rips?.numFactura),
  }
  const mergedMetadatos = {
    ...metadatos,
    perfilFiscal,
    esRipsTemporal: false,
    clinicId: metadatos.clinicId || user?.clinicId || user?.id || null,
  }

  const localIssues = validateRipsPackageLocally(payload, {
    perfilFiscal,
    esRipsTemporal: false,
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
  const payload = stampNumFactura(rips, null)
  const clinicId = String(metadatos.clinicId || user?.clinicId || user?.id || '').trim()

  const localIssues = validateRipsPackageLocally(payload, {
    perfilFiscal,
    esRipsTemporal: true,
    allowNullNumFactura: true,
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
    numFactura: null,
    perfilFiscal,
    status: 'pendiente',
    ripsJson: payload,
  })

  return {
    ok: true,
    success: true,
    route: 'guardarRIPS_Pendiente',
    perfilFiscal,
    numFactura: null,
    pendingRips: record,
    message: 'Sus RIPS se enviarán mensualmente sin factura.',
    rips: payload,
  }
}

function textoMetadato(metadatos, ...keys) {
  for (const key of keys) {
    const text = String(metadatos?.[key] ?? '').trim()
    if (text) return text
  }
  return ''
}

/**
 * Recibo interno y valor cero no son FEV, aunque el prestador esté obligado
 * a facturar otras atenciones. Un paquete sin número y sin factura tampoco.
 * @param {{ perfilFiscal?: unknown, rips?: object, invoice?: object, metadatos?: object, user?: object }} params
 * @returns {'generarFEV_y_RIPS' | 'muv_sin_factura' | 'guardarRIPS_Pendiente'}
 */
export function clasificarRutaFiscal({ perfilFiscal, rips, invoice, metadatos = {}, user } = {}) {
  const resolved = normalizePerfilFiscal(perfilFiscal ?? metadatos.perfilFiscal ?? user?.perfilFiscal)
  const canal = textoMetadato(metadatos, 'canal')
  const vinculo = textoMetadato(metadatos, 'tipoVinculacionFinanciera', 'tipoVinculacion')
  const vinculoFev = vinculo === 'fev' || vinculo === 'factura'
  const vinculoSinFactura = vinculo === 'recibo_interno' || vinculo === 'valor_cero'
  const explicitoSin = canal === 'sin_factura' || vinculoSinFactura
  const explicitoFev = canal === 'fev' || vinculoFev
  const numFactura = normalizeRipsNumFactura(rips?.numFactura)
  const sinFactura = explicitoSin || (!explicitoFev && !invoice && numFactura == null)

  if (!isObligadoFev(resolved)) return 'guardarRIPS_Pendiente'
  if (sinFactura) return 'muv_sin_factura'
  return 'generarFEV_y_RIPS'
}

/**
 * RIPS sin FEV: el recibo de caja se queda en la clínica y numFactura va en null.
 * @param {{ rips: object, metadatos?: object, user?: object }} params
 * @param {{ submit?: typeof submitRipsToMinsalud, saveCuvRecord?: typeof saveCuvRecord }} [deps]
 */
export async function radicarRipsSinFev({ rips, metadatos = {}, user }, deps = {}) {
  const submit = deps.submit ?? submitRipsToMinsalud
  const guardarCuv = deps.saveCuvRecord ?? saveCuvRecord
  const perfilFiscal = normalizePerfilFiscal(metadatos.perfilFiscal ?? user?.perfilFiscal)
  const payload = stampNumFactura(rips, null)
  const mergedMetadatos = {
    ...metadatos,
    perfilFiscal,
    allowNullNumFactura: true,
    canal: 'sin_factura',
    clinicId: metadatos.clinicId || user?.clinicId || user?.id || null,
  }

  const localIssues = validateRipsPackageLocally(payload, {
    perfilFiscal,
    allowNullNumFactura: true,
    crossValidateAgeSex: true,
  })
  if (hasBlockingValidationErrors(localIssues)) {
    return {
      ok: false,
      success: false,
      route: 'muv_sin_factura',
      perfilFiscal,
      numFactura: null,
      estadoMuv: 'RECHAZADO',
      error: 'El RIPS sin factura no cumple validaciones locales.',
      localIssues,
      rips: payload,
    }
  }

  const ministryResult = await submit({ rips: payload, metadatos: mergedMetadatos })
  if (!ministryResult.success) {
    return {
      ok: false,
      success: false,
      route: 'muv_sin_factura',
      perfilFiscal,
      numFactura: null,
      estadoMuv: 'RECHAZADO',
      error:
        ministryResult.source === 'local'
          ? 'El RIPS sin factura no cumple validaciones locales.'
          : 'No se pudo radicar el RIPS sin factura ante MinSalud.',
      localIssues: ministryResult.localIssues ?? localIssues,
      ministryErrors: ministryResult.ministryErrors ?? [],
      source: ministryResult.source,
      rips: payload,
    }
  }

  const cuvRecord = await guardarCuv({
    cuv: ministryResult.cuv,
    numFactura: null,
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

  return {
    ok: true,
    success: true,
    approved: true,
    route: 'muv_sin_factura',
    perfilFiscal,
    numFactura: null,
    cuv: ministryResult.cuv,
    cuvRecordId: cuvRecord.id,
    estadoMuv: 'APROBADO',
    procesoId: ministryResult.procesoId,
    fechaRadicacion: ministryResult.fechaRadicacion,
    estado: ministryResult.estado,
    source: ministryResult.source,
    localIssues: ministryResult.localIssues ?? [],
    message: 'RIPS sin factura radicado. El recibo de caja queda en la clínica.',
    rips: payload,
  }
}

/**
 * Obligado con FEV → FEV+RIPS. Recibo, valor cero o paquete sin número → RIPS sin factura.
 * No obligado → RIPS pendiente (numFactura null).
 * @param {{ perfilFiscal?: unknown, rips: object, invoice?: object, metadatos?: object, user?: object }} params
 * @param {{ submit?: typeof submitRipsToMinsalud, saveCuvRecord?: typeof saveCuvRecord }} [deps]
 */
export async function enrutarPorPerfilFiscal({ perfilFiscal, rips, invoice, metadatos, user }, deps) {
  const route = clasificarRutaFiscal({ perfilFiscal, rips, invoice, metadatos, user })

  if (route === 'muv_sin_factura') {
    return radicarRipsSinFev({ rips, metadatos: { ...metadatos, perfilFiscal }, user }, deps)
  }

  if (route === 'generarFEV_y_RIPS') {
    return generarFEV_y_RIPS({ rips, invoice, metadatos, user })
  }

  return guardarRIPS_Pendiente({ rips, metadatos, user })
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
