/**
 * Host del Mecanismo Único de Validación (FEV-RIPS).
 * Stage es el ambiente de pruebas. Producción entrega el CUV oficial.
 */

export const MUV_SANDBOX_BASE_URL = 'https://stage-fevrips.sispropreprod.gov.co/fevrips-api'
export const MUV_PRODUCTION_BASE_URL = 'https://fevrips.sispro.gov.co/fevrips-api'

function envValue(name, source = process.env) {
  const value = source?.[name]
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * Elige el host del MUV.
 * Producción cuando MINSALUD_ENV=production o MINSALUD_SANDBOX=false.
 * Sin esas señales se usa Stage, para no radicar por accidente.
 * MINSALUD_API_BASE_URL o overrides.baseUrl reemplazan el host por defecto.
 *
 * @param {NodeJS.ProcessEnv} [source]
 * @param {{ baseUrl?: string }} [overrides]
 * @returns {{ sandbox: boolean, baseUrl: string }}
 */
export function resolveMuvEndpoint(source = process.env, overrides = {}) {
  const sandboxFlag = envValue('MINSALUD_SANDBOX', source).toLowerCase()
  const environment = envValue('MINSALUD_ENV', source).toLowerCase()
  const sandbox = sandboxFlag !== 'false' && environment !== 'production'
  const explicit = String(overrides.baseUrl ?? '').trim() || envValue('MINSALUD_API_BASE_URL', source)
  const baseUrl = (explicit || (sandbox ? MUV_SANDBOX_BASE_URL : MUV_PRODUCTION_BASE_URL)).replace(/\/$/, '')
  return { sandbox, baseUrl }
}
