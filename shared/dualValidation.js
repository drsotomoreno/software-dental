/**
 * Estados independientes de la doble validación FEV-Salud (DIAN + MinSalud MUV).
 * CUFE = código de la DIAN (montos). CUV = código de éxito del MUV (paquete clínico).
 */

export const ESTADO_DIAN = Object.freeze({
  PENDIENTE: 'Pendiente',
  APROBADO: 'Aprobado',
  RECHAZADO: 'Rechazado',
})

export const ESTADO_MUV = Object.freeze({
  PENDIENTE_ENVIO: 'Pendiente_Envio',
  APROBADO_CON_CUV: 'Aprobado_Con_CUV',
  RECHAZADO_POR_MUV: 'Rechazado_Por_MUV',
})

export const ESTADO_DIAN_VALUES = Object.values(ESTADO_DIAN)
export const ESTADO_MUV_VALUES = Object.values(ESTADO_MUV)

/** @typedef {'Pendiente' | 'Aprobado' | 'Rechazado'} EstadoDian */
/** @typedef {'Pendiente_Envio' | 'Aprobado_Con_CUV' | 'Rechazado_Por_MUV'} EstadoMuv */

export const DEFAULT_ESTADO_DIAN = ESTADO_DIAN.PENDIENTE
export const DEFAULT_ESTADO_MUV = ESTADO_MUV.PENDIENTE_ENVIO

export function normalizeEstadoDian(value) {
  const raw = String(value ?? '').trim()
  return ESTADO_DIAN_VALUES.includes(raw) ? raw : DEFAULT_ESTADO_DIAN
}

export function normalizeEstadoMuv(value) {
  const raw = String(value ?? '').trim()
  return ESTADO_MUV_VALUES.includes(raw) ? raw : DEFAULT_ESTADO_MUV
}

export function isDianApproved(value) {
  return normalizeEstadoDian(value) === ESTADO_DIAN.APROBADO
}

export function isMuvApprovedWithCuv(value) {
  return normalizeEstadoMuv(value) === ESTADO_MUV.APROBADO_CON_CUV
}

/**
 * La transacción clínica solo está 100% legalizada con CUFE DIAN + CUV MUV.
 * @param {{ estado_dian?: unknown, codigo_cufe?: unknown, estado_muv?: unknown, codigo_cuv?: unknown }} record
 */
export function isTransactionLegalizada(record) {
  return (
    isDianApproved(record?.estado_dian) &&
    Boolean(String(record?.codigo_cufe ?? '').trim()) &&
    isMuvApprovedWithCuv(record?.estado_muv) &&
    Boolean(String(record?.codigo_cuv ?? '').trim())
  )
}

/**
 * Inyecta obligatoriamente el CUFE de la DIAN en el JSON RIPS (Paso 3).
 * @param {object} rips
 * @param {string} cufe
 */
export function injectCufeIntoRips(rips, cufe) {
  const token = String(cufe ?? '').trim()
  if (!token) {
    throw new Error('El CUFE es obligatorio para ensamblar el JSON RIPS antes del envío al MUV.')
  }
  const base = rips && typeof rips === 'object' ? rips : {}
  return {
    ...base,
    cufe: token,
  }
}

/**
 * Suma vrServicio del RIPS (consultas + procedimientos + otros servicios).
 * Acepta también el snapshot simplificado de Control de Pagos.
 * @param {object} [rips]
 */
export function sumRipsVrServicio(rips) {
  if (!rips || typeof rips !== 'object') return 0

  if (typeof rips.vrTotalRips === 'number' && Number.isFinite(rips.vrTotalRips)) {
    return roundCents(rips.vrTotalRips)
  }

  let total = 0
  for (const usuario of rips.usuarios ?? []) {
    for (const consulta of usuario.servicios?.consultas ?? []) {
      total += Number(consulta.vrServicio) || 0
    }
    for (const procedimiento of usuario.servicios?.procedimientos ?? []) {
      total += Number(procedimiento.vrServicio) || 0
    }
    for (const otro of usuario.servicios?.otrosServicios ?? []) {
      total += Number(otro.vrServicio) || 0
    }
  }

  if (!(rips.usuarios ?? []).length) {
    for (const procedimiento of rips.procedimientos ?? []) {
      total += Number(procedimiento.vrServicio) || 0
    }
    for (const otro of rips.otrosServicios ?? []) {
      total += Number(otro.vrServicio) || 0
    }
  }

  return roundCents(total)
}

export function roundCents(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return 0
  return Math.round(n * 100) / 100
}

/**
 * El MUV exige que el JSON RIPS cuadre al centavo con la factura DIAN.
 * @param {number} dianAmount
 * @param {number} ripsAmount
 */
export function amountsMatchToTheCent(dianAmount, ripsAmount) {
  return Math.abs(roundCents(dianAmount) - roundCents(ripsAmount)) < 0.005
}

export function emptyDualValidationFields() {
  return {
    estado_dian: DEFAULT_ESTADO_DIAN,
    codigo_cufe: null,
    estado_muv: DEFAULT_ESTADO_MUV,
    codigo_cuv: null,
    detalles_rechazo_muv: [],
  }
}
