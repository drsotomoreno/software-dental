/**
 * Estados independientes CUFE (DIAN) y CUV (MinSalud MUV).
 * El dinero se legaliza con el CUFE; el proceso de salud cierra con el CUV.
 */

export const ESTADO_DIAN = {
  PENDIENTE: 'Pendiente',
  APROBADO: 'Aprobado',
  RECHAZADO: 'Rechazado',
}

export const ESTADO_MINSALUD_MUV = {
  PENDIENTE_ENVIO: 'Pendiente_Envio',
  APROBADO: 'Aprobado',
  RECHAZADO_CON_GLOSAS: 'Rechazado_Con_Glosas',
}

export const ESTADO_DIAN_VALUES = Object.values(ESTADO_DIAN)
export const ESTADO_MINSALUD_MUV_VALUES = Object.values(ESTADO_MINSALUD_MUV)

export function hasOfficialRipsPackage(rips) {
  if (!rips || typeof rips !== 'object') return false
  const usuarios = rips.usuarios
  if (!Array.isArray(usuarios) || usuarios.length === 0) return false
  return usuarios.some((usuario) => {
    const servicios = usuario?.servicios ?? {}
    return (
      (servicios.consultas?.length || 0) +
        (servicios.procedimientos?.length || 0) +
        (servicios.otrosServicios?.length || 0) >
      0
    )
  })
}

export function syncDualValidationAliases(record = {}) {
  const codigo_cufe = record.codigo_cufe ?? record.cufe ?? null
  const codigo_cuv = record.codigo_cuv ?? record.cuv ?? null
  return {
    ...record,
    codigo_cufe: codigo_cufe || null,
    codigo_cuv: codigo_cuv || null,
    cufe: codigo_cufe || null,
    cuv: codigo_cuv || null,
    estado_dian: record.estado_dian ?? ESTADO_DIAN.PENDIENTE,
    estado_minsalud_muv: record.estado_minsalud_muv ?? ESTADO_MINSALUD_MUV.PENDIENTE_ENVIO,
    detalles_rechazo_muv: Array.isArray(record.detalles_rechazo_muv)
      ? record.detalles_rechazo_muv
      : [],
  }
}

export function isListoParaEntrega(record = {}) {
  const synced = syncDualValidationAliases(record)
  return (
    synced.estado_dian === ESTADO_DIAN.APROBADO &&
    synced.estado_minsalud_muv === ESTADO_MINSALUD_MUV.APROBADO &&
    Boolean(String(synced.codigo_cufe ?? '').trim()) &&
    Boolean(String(synced.codigo_cuv ?? '').trim())
  )
}

/** Mapea los dos estados gubernamentales al ciclo de vida de la FEV en Dexie. */
export function invoiceStatusFromDualValidation(record = {}) {
  const synced = syncDualValidationAliases(record)
  if (synced.estado_dian === ESTADO_DIAN.RECHAZADO) return 'rejected'
  if (synced.estado_minsalud_muv === ESTADO_MINSALUD_MUV.APROBADO) return 'cuv_approved'
  if (synced.estado_dian === ESTADO_DIAN.APROBADO) return 'dian_sent'
  return 'submitted'
}
