/** Vida conservadora del token SISPRO: 1 h 55 min, por debajo de las 2 horas del Ministerio. */
export const TOKEN_VIGENCIA_MS = 115 * 60 * 1000
/** No reutilizar el token si le quedan 5 minutos o menos. Así se evita el rechazo TOT003. */
export const TOKEN_MARGEN_MS = 5 * 60 * 1000
export const TOKEN_VIDA_MAXIMA_MS = 2 * 60 * 60 * 1000

export const HOST_STAGE_FEVRIPS = 'https://stage-fevrips.sispro.gov.co'
export const HOST_MUV_PRODUCCION = 'https://muv.sispro.gov.co'

export function normalizarAmbiente(raw) {
  const id = String(raw ?? 'pruebas').trim().toLowerCase()
  return id === 'produccion' || id === 'production' ? 'produccion' : 'pruebas'
}

export function hostMuvPorAmbiente(raw) {
  return normalizarAmbiente(raw) === 'produccion' ? HOST_MUV_PRODUCCION : HOST_STAGE_FEVRIPS
}

/** El token se reutiliza solo cuando `expiresAt` supera el instante actual más el margen. */
export function tokenSigueVigente(expiresAt, ahora = Date.now()) {
  return Number(expiresAt) > ahora + TOKEN_MARGEN_MS
}

export function vigenciaConservadora(ahora = Date.now()) {
  return ahora + TOKEN_VIGENCIA_MS
}

function codigoTot003(value) {
  return String(value ?? '').trim().toUpperCase() === 'TOT003'
}

/**
 * TOT003 es el rechazo del Ministerio por sesión expirada.
 * Recorre los campos de código y mensaje que devuelve el MUV, sin serializar el objeto entero.
 * @param {unknown} payload
 */
export function esRechazoTot003(payload) {
  if (payload == null) return false
  if (typeof payload === 'string') return /\bTOT003\b/.test(payload)
  if (payload instanceof Error) {
    return (
      payload.sesionExpirada === true ||
      /\bTOT003\b/.test(payload.message) ||
      esRechazoTot003(payload.details) ||
      esRechazoTot003(payload.glosas)
    )
  }
  if (Array.isArray(payload)) return payload.some((item) => esRechazoTot003(item))
  if (typeof payload !== 'object') return false

  if (payload.sesionExpirada === true) return true
  if (codigoTot003(payload.codigo ?? payload.Codigo ?? payload.code ?? payload.Code)) return true

  const mensaje = payload.mensaje ?? payload.message ?? payload.Descripcion ?? payload.descripcion
  if (typeof mensaje === 'string' && /\bTOT003\b/.test(mensaje)) return true

  return [
    payload.details,
    payload.glosas,
    payload.resultadosValidacion,
    payload.ResultadosValidacion,
    payload.Errores,
    payload.errores,
    payload.data,
    payload.error,
  ].some((item) => item != null && item !== payload && esRechazoTot003(item))
}
