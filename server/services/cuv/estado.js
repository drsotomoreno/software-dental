export const CUV_ESTADOS = ['aprobado', 'notificado', 'rechazado']

export const CUV_ESTADO_ETIQUETA = {
  aprobado: 'Aprobado',
  notificado: 'Notificado',
  rechazado: 'Rechazado',
}

const SENSITIVE_KEY = /authorization|token|clave|password|secret|xmlfev/i

/**
 * @param {unknown} value
 */
export function sanitizeMinistryPayload(value) {
  if (Array.isArray(value)) return value.map((item) => sanitizeMinistryPayload(item))
  if (!value || typeof value !== 'object') return value
  const clean = {}
  for (const [key, item] of Object.entries(value)) {
    if (SENSITIVE_KEY.test(key)) continue
    clean[key] = sanitizeMinistryPayload(item)
  }
  return clean
}

/**
 * @param {unknown} value
 */
export function cuvUtil(value) {
  if (typeof value !== 'string') return false
  const trimmed = value.trim()
  if (trimmed.length < 8) return false
  if (/^no aplica/i.test(trimmed)) return false
  return true
}

/**
 * @param {unknown} item
 * @param {'RECHAZADO' | 'NOTIFICACION'} fallback
 */
function normalizarRegla(item, fallback) {
  const source = item && typeof item === 'object' ? item : {}
  const claseRaw = String(source.clase ?? source.Clase ?? fallback).trim().toUpperCase()
  const clase = claseRaw.startsWith('NOTIF') ? 'NOTIFICACION' : claseRaw.startsWith('RECHAZ') ? 'RECHAZADO' : fallback
  return {
    clase,
    codigo: String(source.codigo ?? source.code ?? source.Codigo ?? '').trim(),
    descripcion: String(source.descripcion ?? source.message ?? source.Descripcion ?? '').trim(),
    observaciones: String(source.observaciones ?? source.Observaciones ?? '').trim(),
    pathFuente: String(source.pathFuente ?? source.field ?? source.PathFuente ?? '').trim(),
    fuente: String(source.fuente ?? source.Fuente ?? 'MUV').trim(),
  }
}

/**
 * Aprobado: hay CUV y ninguna regla pendiente.
 * Notificado: el ministerio entregó CUV y dejó NOTIFICACION (sigue exigiendo revisión).
 * Rechazado: hay RECHAZADO o no hay CUV utilizable.
 *
 * @param {{ cuv?: unknown, notificaciones?: unknown[], rechazos?: unknown[] }} input
 * @returns {'aprobado' | 'notificado' | 'rechazado'}
 */
export function clasificarEstadoCuv(input) {
  const rechazos = (input.rechazos ?? []).map((item) => normalizarRegla(item, 'RECHAZADO'))
  const notificaciones = (input.notificaciones ?? [])
    .map((item) => normalizarRegla(item, 'NOTIFICACION'))
    .filter((item) => item.clase !== 'RECHAZADO')
  if (rechazos.length > 0 || !cuvUtil(input.cuv)) return 'rechazado'
  if (notificaciones.length > 0) return 'notificado'
  return 'aprobado'
}

/**
 * @param {{ estado: string, notificaciones?: unknown[], rechazos?: unknown[] }} input
 */
export function alertasDeEstado(input) {
  const notificaciones = (input.notificaciones ?? []).map((item) => normalizarRegla(item, 'NOTIFICACION'))
  const rechazos = (input.rechazos ?? []).map((item) => normalizarRegla(item, 'RECHAZADO'))
  if (input.estado === 'notificado') {
    return [{
      nivel: 'atencion',
      titulo: 'El MUV notificó reglas que requieren revisión',
      detalle: 'La factura quedó radicada y el CUV es válido. Revise cada notificación antes de cerrar el trámite.',
      reglas: notificaciones,
    }]
  }
  if (input.estado === 'rechazado') {
    return [{
      nivel: 'rechazo',
      titulo: 'El MUV rechazó el paquete',
      detalle: 'Corrija las reglas rechazadas y reenvíe el paquete desde Validación CUV.',
      reglas: rechazos,
    }]
  }
  return []
}

export function etiquetaEstado(estado) {
  return CUV_ESTADO_ETIQUETA[estado] ?? estado
}
