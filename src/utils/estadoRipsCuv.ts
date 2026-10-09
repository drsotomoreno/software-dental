/** Textos legibles a partir de `resultado_validacion` del MUV. */

export type EstadoMuv = 'PENDIENTE' | 'APROBADO' | 'RECHAZADO'

const REGLAS: Record<string, string> = {
  RVC091: 'Rechazado por regla RVC091: el valor pagado por el paciente no puede ser 0.',
  RVG01: 'Rechazado por regla RVG01: el documento del paciente no figura en las bases oficiales.',
}

const CAMPOS: Record<string, string> = {
  vrServicio: REGLAS.RVC091,
  fechaInicioAtencion: 'Rechazado: la fecha de inicio de la atención no es válida.',
  fechaFinAtencion: 'Rechazado: la fecha de fin de la atención no es válida.',
  fechaNacimiento: 'Rechazado: la fecha de nacimiento del paciente no es válida.',
  codDiagnosticoPrincipal: 'Rechazado: falta el diagnóstico principal CIE-10.',
  numDocumentoIdentificacion: 'Rechazado: falta el documento del paciente.',
  codPrestador: 'Rechazado: el código del prestador debe tener 12 dígitos.',
}

export function leerEstadoMuv(source: {
  estadoMuv?: string | null
  estado_muv?: string | null
} | null | undefined): EstadoMuv | null {
  const raw = source?.estadoMuv ?? source?.estado_muv
  const value = String(raw ?? '').trim().toUpperCase()
  if (value === 'PENDIENTE' || value === 'APROBADO' || value === 'RECHAZADO') return value
  return null
}

export function leerResultadoValidacion(source: {
  resultadoValidacion?: unknown
  resultado_validacion?: unknown
} | null | undefined): unknown {
  if (!source) return null
  if (source.resultadoValidacion != null) return source.resultadoValidacion
  return source.resultado_validacion ?? null
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
  if (/vrServicio|valor pagado/i.test(error) && /0|null|indefinido/i.test(error)) return REGLAS.RVC091
  if (/fecha/i.test(error) && /inválid|invalida|no se pudo interpretar|obligatoria/i.test(error)) {
    return 'Rechazado: la fecha de la atención no es válida.'
  }
  return error.trim()
}

export function mensajesResultadoValidacion(value: unknown): string[] {
  if (value == null || value === '') {
    return ['El MUV rechazó el RIPS de esta atención.']
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        return mensajesResultadoValidacion(JSON.parse(trimmed))
      } catch {
        // El texto no era JSON; se muestra tal cual.
      }
    }
    const texto = humanizarError(trimmed)
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
    const field = String(row.field ?? '').trim()
    if (field && CAMPOS[field]) return [CAMPOS[field]]
    if (typeof row.error === 'string' && row.error.trim()) return [humanizarError(row.error)]
    if (Array.isArray(row.errors) && row.errors.length > 0) {
      return row.errors.map((item) => humanizarError(String(item))).filter(Boolean)
    }
  }
  return ['El MUV rechazó el RIPS de esta atención.']
}

/** Quita códigos de regla y deja una frase que el odontólogo puede leer. */
function suavizarMensajeMuv(mensaje: string): string {
  const limpio = mensaje
    .replace(/^Notificación por regla\s+[A-Za-z0-9]+\s*:\s*/i, '')
    .replace(/^Rechazado por regla\s+[A-Za-z0-9]+\s*:\s*/i, '')
    .replace(/^Rechazado:\s*/i, '')
    .replace(/\bMUV\b/g, 'Ministerio')
    .trim()
  if (!limpio || /^El Ministerio rechazó el RIPS/i.test(limpio)) {
    return 'No recibimos el detalle. Revise los datos de la atención y vuelva a enviarla.'
  }
  return limpio.charAt(0).toUpperCase() + limpio.slice(1)
}

/** Texto que va después de «El Ministerio solicitó una corrección en este RIPS:». */
export function textoCorreccionRips(value: unknown): string {
  const mensajes = mensajesResultadoValidacion(value).map(suavizarMensajeMuv).filter(Boolean)
  if (mensajes.length === 0) {
    return 'No recibimos el detalle. Revise los datos de la atención y vuelva a enviarla.'
  }
  return mensajes.join(' ')
}
