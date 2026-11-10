/**
 * Fecha de apertura del paciente. Se estampa al ingreso y no se recorre
 * hacia adelante: mercadeo y la ficha muestran la primera marca válida.
 */

export function instanteApertura(value) {
  const text = String(value ?? '').trim()
  if (!text) return null
  const parsed = new Date(text)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed
}

/** Conserva la apertura más antigua. Cadena vacía si ninguna fecha es válida. */
export function conservarFechaApertura(actual, entrante) {
  const left = instanteApertura(actual)
  const right = instanteApertura(entrante)
  if (left && right) {
    return left.getTime() <= right.getTime() ? String(actual).trim() : String(entrante).trim()
  }
  if (left) return String(actual).trim()
  if (right) return String(entrante).trim()
  return ''
}

const ETIQUETA_APERTURA = new Intl.DateTimeFormat('es-CO', {
  dateStyle: 'long',
  timeStyle: 'short',
  timeZone: 'America/Bogota',
})

export function etiquetaAperturaPaciente(createdAt) {
  const instant = instanteApertura(createdAt)
  if (!instant) return ''
  return ETIQUETA_APERTURA.format(instant)
}

export function textoHistoriaCreadaEn(createdAt) {
  const etiqueta = etiquetaAperturaPaciente(createdAt)
  return etiqueta ? `Historia creada en ${etiqueta}` : 'Historia creada en —'
}

export function ordenarPorAperturaDesc(rows) {
  const list = Array.isArray(rows) ? rows : []
  return [...list].sort((a, b) => {
    const left = instanteApertura(a?.createdAt)?.getTime() ?? Number.NEGATIVE_INFINITY
    const right = instanteApertura(b?.createdAt)?.getTime() ?? Number.NEGATIVE_INFINITY
    return right - left
  })
}

export function selloAperturaPaciente(instant = new Date()) {
  const iso = instant.toISOString()
  return { createdAt: iso, updatedAt: iso }
}
