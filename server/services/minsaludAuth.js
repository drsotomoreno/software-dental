import { config } from '../config.js'

/** Ambiente de pruebas FEV-RIPS cuando no hay URL propia en la configuración. */
const MSPS_BASE_URL_DEFAULT = 'https://stage-fevrips.sispro.gov.co'

/** Margen para no reutilizar un token que está a punto de vencer (5 minutos). */
const TOKEN_REUSE_MARGIN_MS = 300000

/** Vigencia de 2 horas, fijada a 1 hora 55 minutos por seguridad. */
const TOKEN_TTL_MS = 115 * 60 * 1000

/**
 * Almacén en memoria segmentado por NIT del obligado.
 * Cada prestador conserva su propio token.
 * @type {Map<string, { token: string, expiresAt: number }>}
 */
const tokenCachePorNit = new Map()

function soloDigitos(value) {
  return String(value ?? '').replace(/\D/g, '')
}

function mspsAuthUrl() {
  const explicit = String(config.minsalud.authUrl || '').trim()
  if (explicit) return explicit
  const base = String(config.minsalud.apiBaseUrl || MSPS_BASE_URL_DEFAULT).replace(/\/$/, '')
  return `${base}/api/v1/auth`
}

/**
 * @param {{ tipoUsuario?: unknown, numeroDocumento?: unknown, nitObligado?: unknown }} [credenciales]
 */
export function normalizarCredencialesPrestador(credenciales = {}) {
  return {
    tipoUsuario: String(credenciales.tipoUsuario ?? '').trim(),
    numeroDocumento: soloDigitos(credenciales.numeroDocumento),
    nitObligado: soloDigitos(credenciales.nitObligado),
  }
}

export function credencialesCompletas(credenciales) {
  const { tipoUsuario, numeroDocumento, nitObligado } = normalizarCredencialesPrestador(credenciales)
  return Boolean(tipoUsuario && numeroDocumento && nitObligado)
}

/**
 * Credenciales del usuario que ejecuta la transacción.
 * El NIT del prestador puede venir del perfil o, en último término, del RIPS.
 * @param {object} [user]
 * @param {{ tipoUsuario?: unknown, numeroDocumento?: unknown, nitObligado?: unknown, numDocumentoIdObligado?: unknown }} [extras]
 */
export function credencialesDesdeUsuario(user, extras = {}) {
  return normalizarCredencialesPrestador({
    tipoUsuario: extras.tipoUsuario ?? user?.tipoUsuario ?? user?.documentType,
    numeroDocumento: extras.numeroDocumento ?? user?.numeroDocumento ?? user?.documentNumber,
    nitObligado:
      extras.nitObligado ?? user?.nitObligado ?? user?.providerNit ?? extras.numDocumentoIdObligado,
  })
}

/** Respaldo de un solo prestador configurado en el servidor. */
export function credencialesDesdeConfiguracion() {
  const documento = soloDigitos(config.minsalud.username)
  const tipoUsuario =
    String(config.minsalud.tipoUsuario || '').trim() || (documento ? 'CC' : '')
  return normalizarCredencialesPrestador({
    tipoUsuario,
    numeroDocumento: documento,
    nitObligado: config.minsalud.nit,
  })
}

/**
 * Prioriza las credenciales explícitas de la transacción y, si faltan, las del usuario en sesión.
 * @param {{ user?: object, rips?: object, metadatos?: object, credenciales?: object }} [contexto]
 */
export function resolverCredencialesPrestador({ user, rips, metadatos = {}, credenciales } = {}) {
  const fromMeta =
    metadatos?.credenciales && typeof metadatos.credenciales === 'object' ? metadatos.credenciales : {}
  const explicit = credenciales && typeof credenciales === 'object' ? credenciales : {}
  const direct = credencialesDesdeUsuario(user, {
    tipoUsuario: explicit.tipoUsuario ?? fromMeta.tipoUsuario,
    numeroDocumento: explicit.numeroDocumento ?? fromMeta.numeroDocumento,
    nitObligado: explicit.nitObligado ?? fromMeta.nitObligado,
  })
  if (credencialesCompletas(direct)) return direct

  const identidadDeTransaccion = Boolean(
    user ||
      explicit.tipoUsuario ||
      explicit.numeroDocumento ||
      explicit.nitObligado ||
      fromMeta.tipoUsuario ||
      fromMeta.numeroDocumento ||
      fromMeta.nitObligado,
  )
  if (!identidadDeTransaccion) {
    const fromEnv = credencialesDesdeConfiguracion()
    if (credencialesCompletas(fromEnv)) return fromEnv
  }

  if (!direct.nitObligado && rips?.numDocumentoIdObligado) {
    return normalizarCredencialesPrestador({
      ...direct,
      nitObligado: rips.numDocumentoIdObligado,
    })
  }
  return direct
}

function errorAutenticacion(nitObligado, mensaje, details) {
  const error = new Error(`Fallo de autenticación para el NIT ${nitObligado}: ${mensaje}`)
  error.status = 502
  if (details !== undefined) error.details = details
  return error
}

/**
 * Obtiene o reutiliza el token de acceso del Ministerio de forma dinámica por cada usuario/clínica.
 * @param {{ tipoUsuario: string, numeroDocumento: string, nitObligado: string }} credenciales
 * @returns {Promise<string>}
 */
export async function obtenerTokenMultiusuario(credenciales) {
  const ahora = Date.now()
  const { tipoUsuario, numeroDocumento, nitObligado } = normalizarCredencialesPrestador(credenciales)

  if (!tipoUsuario || !numeroDocumento || !nitObligado) {
    const error = new Error(
      'Faltan credenciales del prestador que realiza la transacción (tipoUsuario, numeroDocumento, nitObligado).',
    )
    error.status = 400
    throw error
  }

  const cached = tokenCachePorNit.get(nitObligado)
  if (cached && cached.expiresAt > ahora + TOKEN_REUSE_MARGIN_MS) {
    return cached.token
  }

  try {
    const response = await fetch(mspsAuthUrl(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ tipoUsuario, numeroDocumento, nitObligado }),
    })

    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw errorAutenticacion(
        nitObligado,
        data?.mensaje || data?.message || response.statusText || 'respuesta no exitosa',
        data,
      )
    }

    const token = data.token || data.access_token
    if (!token) {
      throw errorAutenticacion(nitObligado, 'la respuesta no incluye token', data)
    }

    tokenCachePorNit.set(nitObligado, {
      token,
      expiresAt: ahora + TOKEN_TTL_MS,
    })
    return token
  } catch (error) {
    if (error?.status) throw error
    throw errorAutenticacion(nitObligado, error?.message || 'error de red')
  }
}

/**
 * @param {{ tipoUsuario: string, numeroDocumento: string, nitObligado: string }} credenciales
 */
export async function getMinsaludAccessToken(credenciales) {
  return obtenerTokenMultiusuario(credenciales)
}

/** Limpia el token de un prestador o, sin argumento, el de todos. */
export function clearMinsaludTokenCache(nitObligado) {
  if (nitObligado === undefined || nitObligado === null || nitObligado === '') {
    tokenCachePorNit.clear()
    return
  }
  tokenCachePorNit.delete(soloDigitos(nitObligado))
}
