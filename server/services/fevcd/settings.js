/**
 * Ambientes del manual FEVCD v1.0 / v1.2 (septiembre de 2026).
 * Stage y el host dev del control de cambios son pruebas.
 * Producción no se usa mientras la versión siga marcada como preliminar.
 */

export const FEVCD_HOSTS = {
  stage: 'https://stage-fevrips.sispropreprod.gov.co',
  dev: 'https://dev-fevrips.sispropreprod.gov.co',
  produccion: 'https://fevrips.sispro.gov.co',
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 */
export function resolveFevcdSettings(env = process.env) {
  const requested = String(env.FEVCD_AMBIENTE ?? 'stage').trim().toLowerCase()
  const ambiente = requested in FEVCD_HOSTS ? requested : 'stage'
  const preliminar = env.FEVCD_PRELIMINAR !== 'false'
  const apiBaseUrl = String(env.FEVCD_API_BASE_URL ?? FEVCD_HOSTS[ambiente]).replace(/\/$/, '')
  const maxAttempts = clampInt(env.FEVCD_MAX_ATTEMPTS, 3, 1, 5)
  const fragmentBytes = clampInt(env.FEVCD_FRAGMENT_BYTES, 5 * 1024 * 1024, 1024, 20 * 1024 * 1024)

  return {
    sandbox: env.FEVCD_SANDBOX !== 'false',
    ambiente,
    preliminar,
    apiBaseUrl,
    receptorPath: env.FEVCD_RECEPTOR_PATH || '/api/Receptor/Cargar',
    consultaPath: env.FEVCD_CONSULTA_PATH || '/api/Consultas/Envios',
    maxAttempts,
    fragmentBytes,
    retryBaseMs: clampInt(env.FEVCD_RETRY_BASE_MS, 400, 50, 10_000),
    timeoutMs: clampInt(env.FEVCD_TIMEOUT_MS, 60_000, 1_000, 180_000),
    enviarDetalle: env.FEVCD_ENVIAR_DETALLE !== 'false',
  }
}

/**
 * @param {ReturnType<typeof resolveFevcdSettings>} settings
 */
export function ambientePermitido(settings) {
  if (settings.ambiente === 'produccion' && settings.preliminar) {
    return {
      ok: false,
      codigo: 'FEVCD_PRELIMINAR',
      descripcion:
        'El módulo de compra directa sigue en pruebas preliminares. El envío a producción queda detenido hasta marcar FEVCD_PRELIMINAR=false.',
    }
  }
  return { ok: true }
}

/**
 * @param {string | undefined} value
 * @param {number} fallback
 * @param {number} min
 * @param {number} max
 */
function clampInt(value, fallback, min, max) {
  const parsed = Number(value)
  if (!Number.isInteger(parsed)) return fallback
  return Math.min(max, Math.max(min, parsed))
}
