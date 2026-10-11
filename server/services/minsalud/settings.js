/**
 * Credenciales FEV-RIPS / MUV leídas solo desde el entorno.
 *
 * LoginSISPRO (FEVRM001 §8.1 / guía FEVRG02): tipo y número de documento,
 * clave SISPRO y NIT. El certificado de cliente es transporte (mTLS) cuando
 * el API dockerizado o el gateway lo exigen; no reemplaza el login.
 *
 * client_credentials queda para un gateway que publique su propio token
 * endpoint (MINSALUD_AUTH_URL). El MUV no expone /oauth/token.
 */

const DOCUMENT_TYPES = new Set(['CC', 'CE', 'PA', 'RC', 'TI', 'NV', 'CD', 'SC', 'PE', 'PT', 'NI'])
const USER_TYPES = new Set(['RE', 'PIN', 'PINx', 'PIE'])

/**
 * @param {string} value
 */
export function normalizeUserType(value) {
  if (!value) return ''
  if (value.toLowerCase() === 'pinx') return 'PINx'
  return value.toUpperCase()
}

/**
 * @param {unknown} value
 * @param {number} fallback
 * @param {number} min
 * @param {number} max
 */
function clampInt(value, fallback, min, max) {
  if (value === undefined || value === null || value === '') return fallback
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, Math.trunc(parsed)))
}

/**
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} env
 * @param {string} name
 */
function text(env, name) {
  const value = env[name]
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} env
 */
export function readMinsaludAuthSettings(env) {
  const numeroDocumento = text(env, 'MINSALUD_NUMERO_DOCUMENTO') || text(env, 'MINSALUD_USERNAME')
  const clave = text(env, 'MINSALUD_CLAVE') || text(env, 'MINSALUD_PASSWORD')
  const clientId = text(env, 'MINSALUD_CLIENT_ID')
  const clientSecret = text(env, 'MINSALUD_CLIENT_SECRET')
  const nit = text(env, 'MINSALUD_NIT')
  const authUrl = text(env, 'MINSALUD_AUTH_URL')
  const apiBaseUrl = text(env, 'MINSALUD_API_BASE_URL').replace(/\/$/, '')

  const explicitMode = text(env, 'MINSALUD_AUTH_MODE').toLowerCase()
  const sisproReady = Boolean(numeroDocumento && clave && nit && (apiBaseUrl || authUrl))
  const clientReady = Boolean(clientId && clientSecret && authUrl)
  let authMode = 'login_sispro'
  if (explicitMode === 'client_credentials' || explicitMode === 'login_sispro') {
    authMode = explicitMode
  } else if (!sisproReady && clientReady) {
    authMode = 'client_credentials'
  }

  const mechanism = text(env, 'MINSALUD_TIPO_MECANISMO_VALIDACION')
  const repsRaw = text(env, 'MINSALUD_REPS').toLowerCase()
  const clientAuth = text(env, 'MINSALUD_CLIENT_AUTH').toLowerCase() === 'basic' ? 'basic' : 'body'
  const tipoUsuario = normalizeUserType(text(env, 'MINSALUD_TIPO_USUARIO'))

  return {
    authMode,
    apiBaseUrl,
    authUrl,
    authPath: text(env, 'MINSALUD_AUTH_PATH') || '/api/Auth/LoginSISPRO',
    tipoDocumento: (text(env, 'MINSALUD_TIPO_DOCUMENTO') || 'CC').toUpperCase(),
    numeroDocumento,
    clave,
    nit,
    tipoUsuario,
    tipoMecanismoValidacion: mechanism === '' ? null : Number(mechanism),
    reps: repsRaw === '' ? null : repsRaw === 'true',
    clientId,
    clientSecret,
    clientScope: text(env, 'MINSALUD_CLIENT_SCOPE'),
    clientAuth,
    tls: {
      cert: text(env, 'MINSALUD_TLS_CERT'),
      key: text(env, 'MINSALUD_TLS_KEY'),
      ca: text(env, 'MINSALUD_TLS_CA'),
      certPath: text(env, 'MINSALUD_TLS_CERT_PATH'),
      keyPath: text(env, 'MINSALUD_TLS_KEY_PATH'),
      caPath: text(env, 'MINSALUD_TLS_CA_PATH'),
      passphrase: text(env, 'MINSALUD_TLS_KEY_PASSPHRASE'),
      rejectUnauthorized: text(env, 'MINSALUD_TLS_REJECT_UNAUTHORIZED').toLowerCase() !== 'false',
    },
    tokenSkewMs: clampInt(env.MINSALUD_TOKEN_SKEW_MS, 60_000, 0, 15 * 60_000),
    tokenTtlSeconds: clampInt(env.MINSALUD_TOKEN_TTL_SECONDS, 3600, 30, 24 * 60 * 60),
    timeoutMs: clampInt(env.MINSALUD_AUTH_TIMEOUT_MS, 20_000, 1000, 120_000),
    maxAttempts: clampInt(env.MINSALUD_AUTH_MAX_ATTEMPTS, 3, 1, 5),
    retryBaseMs: clampInt(env.MINSALUD_AUTH_RETRY_BASE_MS, 400, 50, 10_000),
    retryMaxMs: clampInt(env.MINSALUD_AUTH_RETRY_MAX_MS, 8000, 50, 30_000),
  }
}

/**
 * @param {ReturnType<typeof readMinsaludAuthSettings>} settings
 */
export function credentialsAreConfigured(settings) {
  if (settings.authMode === 'client_credentials') {
    return Boolean(settings.authUrl && settings.clientId && settings.clientSecret)
  }
  return Boolean(
    (settings.apiBaseUrl || settings.authUrl) &&
      settings.numeroDocumento &&
      settings.clave &&
      settings.nit,
  )
}

export function assertDocumentType(tipoDocumento) {
  if (!DOCUMENT_TYPES.has(tipoDocumento)) {
    throw new Error(`tipo de documento SISPRO no admitido: ${tipoDocumento}`)
  }
}

export function assertUserType(tipoUsuario) {
  if (tipoUsuario && !USER_TYPES.has(tipoUsuario)) {
    throw new Error('tipoUsuario debe ser RE, PIN, PINx o PIE')
  }
}

export { DOCUMENT_TYPES, USER_TYPES }
