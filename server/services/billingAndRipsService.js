/**
 * Orquestación FEV / RIPS según perfil fiscal del prestador.
 * Tras el dictado (CIE-10 + CUPS), Obligado_FEV ejecuta DIAN→CUFE→RIPS→MUV→CUV;
 * No_Obligado guarda RIPS pendiente con numFactura = null.
 */
import { saveTemporaryRipsRecord } from './ripsTemporalStore.js'
import { hasBlockingValidationErrors, validateRipsPackageLocally } from './ripsLocalValidator.js'
import { ejecutarFlujoDobleValidacion } from './dualValidationBilling.js'
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
 * Prestador obligado a FEV: valida localmente y ejecuta la doble validación
 * DIAN (CUFE) → ensamblaje RIPS → MUV (CUV).
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
      estado_dian: 'Pendiente',
      estado_muv: 'Pendiente_Envio',
      codigo_cufe: null,
      codigo_cuv: null,
      detalles_rechazo_muv: [],
    }
  }

  if (!invoice) {
    return {
      ok: false,
      success: false,
      route: 'generarFEV_y_RIPS',
      perfilFiscal,
      error: 'El flujo FEV exige el payload de factura para enviar el XML a la DIAN (Paso 1).',
      localIssues,
      estado_dian: 'Pendiente',
      estado_muv: 'Pendiente_Envio',
      codigo_cufe: null,
      codigo_cuv: null,
      detalles_rechazo_muv: [],
    }
  }

  const result = await ejecutarFlujoDobleValidacion({
    rips: payload,
    invoice,
    metadatos: mergedMetadatos,
  })

  return {
    ...result,
    ok: result.legalizada === true,
    success: result.legalizada === true,
    approved: result.legalizada === true,
    route: 'generarFEV_y_RIPS',
    perfilFiscal,
    numFactura: payload.numFactura,
    cuv: result.codigo_cuv ?? null,
    cufe: result.codigo_cufe ?? null,
    cuvRecordId: result.cuvRecordId,
    procesoId: result.procesoId,
    fechaRadicacion: result.fechaRadicacion,
    estado: result.estado,
    source: result.source,
    localIssues: result.localIssues ?? localIssues,
    ministryErrors: result.ministryErrors ?? result.detalles_rechazo_muv ?? [],
    dianXml: result.dianXml,
    rips: result.rips ?? payload,
    error: result.error,
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

/**
 * If/Else de perfil fiscal: Obligado → FEV+RIPS; si no → RIPS pendiente (numFactura null).
 * @param {{ perfilFiscal?: unknown, rips: object, invoice?: object, metadatos?: object, user?: object }} params
 */
export async function enrutarPorPerfilFiscal({ perfilFiscal, rips, invoice, metadatos, user }) {
  const resolved = normalizePerfilFiscal(perfilFiscal ?? user?.perfilFiscal)

  if (isObligadoFev(resolved)) {
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
