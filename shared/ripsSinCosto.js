/**
 * RIPS de una atención sin cobro (control, garantía o cortesía).
 * No hay recaudo, pero el paquete no puede salir huérfano: lleva un agrupador
 * de $0 con prefijo propio y la suma de los valorNeto cuadra contra ese total.
 * Opción A: los campos financieros viajan en cero. No se reporta el nominal
 * con un descuento del 100 %.
 */

export const TIPO_USUARIO_PARTICULAR = '04'
export const CONCEPTO_RECAUDO_NO_APLICA = '05'
export const ESTADO_PROCESADO = 'PROCESADO'

export const MUV_PRODUCCION_BASE = 'https://fevrips.sispro.gov.co/fevrips-api'

export const PREFIJOS_SIN_COSTO = {
  control: 'CTRL-',
  garantia: 'GAR-',
  cortesia: 'CORT-',
}

const MOTIVOS = new Set(['control', 'garantia', 'cortesia'])

export function sinAcentos(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
}

/** CTRL-, GAR- o CORT-, también si ya viene armado como CTRL-050. */
export function esPrefijoSinCosto(value) {
  return /^(CTRL|GAR|CORT)-/i.test(String(value ?? '').trim())
}

export function motivoSinCostoDe(value) {
  const text = sinAcentos(value)
  if (!text) return 'control'
  if (text.startsWith('gar')) return 'garantia'
  if (text.startsWith('cor')) return 'cortesia'
  if (MOTIVOS.has(text)) return text
  return 'control'
}

export function prefijoTransmisionSinCosto(motivo) {
  return PREFIJOS_SIN_COSTO[motivoSinCostoDe(motivo)]
}

export function etiquetaMotivoSinCosto(motivo) {
  const normal = motivoSinCostoDe(motivo)
  if (normal === 'garantia') return 'Garantía'
  if (normal === 'cortesia') return 'Cortesía'
  return 'Control'
}

/**
 * Consecutivo interno no financiero. CTRL-050, GAR-002, CORT-001.
 * @param {string} prefijo
 * @param {number} consecutivo
 */
export function numeroPaqueteSinCosto(prefijo, consecutivo) {
  const base = esPrefijoSinCosto(prefijo) ? String(prefijo).trim().toUpperCase() : prefijoTransmisionSinCosto(prefijo)
  const numero = Math.trunc(Number(consecutivo))
  if (!Number.isInteger(numero) || numero < 1) {
    throw new Error('El consecutivo del agrupador sin costo debe ser un entero mayor a cero.')
  }
  return `${base}${String(numero).padStart(3, '0')}`
}

/** Opción A. El nominal del catálogo no se envía. */
export function valoresFinancierosCostoCero() {
  return {
    valorProcedimiento: 0,
    valorDescuento: 0,
    valorNeto: 0,
    vrServicio: 0,
    valorPagoModerador: 0,
    conceptoRecaudo: CONCEPTO_RECAUDO_NO_APLICA,
  }
}

function tipoVinculo(evolucion) {
  return (
    evolucion?.ripsMetadata?.tipoVinculacionFinanciera ??
    evolucion?.tipoVinculacionFinanciera ??
    ''
  )
}

/**
 * La atención no genera cobro. Un recibo o una FEV explícitos no entran aquí.
 * @param {object | null | undefined} evolucion
 */
export function esEvolucionSinCosto(evolucion) {
  if (!evolucion || typeof evolucion !== 'object') return false
  const tipo = String(tipoVinculo(evolucion)).trim()
  if (tipo === 'recibo_interno' || tipo === 'fev') return false
  if (evolucion.es_sin_costo === true || evolucion.esSinCosto === true) return true
  if (tipo === 'valor_cero') return true
  const estado = String(evolucion.estadoRips ?? '').trim().toUpperCase()
  if (estado === 'SIN_COSTO' || estado === 'PROCESADO') return true
  const motivo = sinAcentos(evolucion.motivoSinCosto ?? evolucion.etiquetaSinCosto ?? '')
  if (motivo === 'control' || motivo === 'garantia' || motivo === 'cortesia') return true
  if (
    evolucion.isBillable === false &&
    estado !== 'PAGADO' &&
    estado !== 'COBRADO_PROCESADO'
  ) {
    return true
  }
  return false
}

export function sesionEsSinCosto(evoluciones) {
  const lista = (Array.isArray(evoluciones) ? evoluciones : []).filter(
    (item) => item && item.kind !== 'addendum',
  )
  return lista.length > 0 && lista.every((item) => esEvolucionSinCosto(item))
}

function pesos(value) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 0
  return Math.round(parsed)
}

/**
 * Regla 5 con la excepción de costo cero.
 * La suma de valorNeto debe ser exactamente el total del agrupador.
 * 0 = 0 es válido. Un descuadre, aunque el agrupador valga 0, no lo es.
 * @param {{ valorTotal: unknown, items?: Array<{ valorNeto?: unknown, vrServicio?: unknown }>, numero?: string }} input
 */
export function validarSumatoriaAgrupador(input = {}) {
  const items = Array.isArray(input.items) ? input.items : []
  const valorTotal = pesos(input.valorTotal)
  if (valorTotal < 0 || items.some((item) => pesos(item?.valorNeto ?? item?.vrServicio) < 0)) {
    return {
      ok: false,
      valorTotal,
      suma: 0,
      permiteCero: false,
      message: 'Los valores netos del RIPS no pueden ser negativos.',
    }
  }
  const suma = items.reduce((total, item) => total + pesos(item?.valorNeto ?? item?.vrServicio), 0)
  if (suma === valorTotal) {
    return {
      ok: true,
      valorTotal,
      suma,
      permiteCero: valorTotal === 0,
      message: '',
    }
  }
  const numero = String(input.numero ?? '').trim()
  const identificador = numero ? ` ${numero}` : ''
  return {
    ok: false,
    valorTotal,
    suma,
    permiteCero: false,
    message:
      `La suma de los valorNeto (${suma}) debe ser exactamente igual al total del agrupador${identificador} (${valorTotal}).`,
  }
}
