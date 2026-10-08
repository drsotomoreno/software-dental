/** Textos legibles a partir de `resultado_validacion` del MUV. */

const REGLAS: Record<string, string> = {
  RVC091: 'Rechazado por regla RVC091: el valor pagado por el paciente no puede ser 0.',
  RVG01: 'Rechazado por regla RVG01: el documento del paciente no figura en las bases oficiales.',
}

function textoDeItem(item: unknown): string {
  if (typeof item === 'string') return item.trim()
  if (!item || typeof item !== 'object') return ''
  const row = item as Record<string, unknown>
  const codigo = String(row.Codigo ?? row.codigo ?? '').trim()
  if (codigo && REGLAS[codigo]) return REGLAS[codigo]
  const descripcion = String(row.Descripcion ?? row.descripcion ?? row.message ?? row.error ?? '').trim()
  const clase = String(row.Clase ?? row.clase ?? '').toUpperCase()
  const prefijo = clase === 'NOTIFICACION' ? 'Notificación' : 'Rechazado'
  if (codigo && descripcion) return `${prefijo} por regla ${codigo}: ${descripcion}`
  if (codigo) return `${prefijo} por regla ${codigo}.`
  return descripcion
}

function humanizarError(error: string): string {
  const codigo = error.match(/RVC091|RVG01/)?.[0]
  if (codigo && REGLAS[codigo]) return REGLAS[codigo]
  return error.trim()
}

export function mensajesResultadoValidacion(value: unknown): string[] {
  if (value == null || value === '') {
    return ['El MUV rechazó el RIPS de esta atención.']
  }
  if (typeof value === 'string') {
    const texto = humanizarError(value)
    return texto ? [texto] : ['El MUV rechazó el RIPS de esta atención.']
  }
  if (Array.isArray(value)) {
    const mensajes = value.map(textoDeItem).filter(Boolean)
    return mensajes.length > 0 ? mensajes : ['El MUV rechazó el RIPS de esta atención.']
  }
  if (typeof value === 'object') {
    const row = value as Record<string, unknown>
    const anidado = row.ResultadosValidacion ?? row.resultadosValidacion
    if (Array.isArray(anidado) && anidado.length > 0) return mensajesResultadoValidacion(anidado)
    if (typeof row.error === 'string' && row.error.trim()) return [humanizarError(row.error)]
    if (Array.isArray(row.errors) && row.errors.length > 0) {
      return row.errors.map((item) => humanizarError(String(item))).filter(Boolean)
    }
  }
  return ['El MUV rechazó el RIPS de esta atención.']
}
