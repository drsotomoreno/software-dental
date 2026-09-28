import { config, hasMinsaludCredentials } from '../config.js'
import { resolveMuvAmbiente } from './muvAmbiente.js'
import { muvClient } from './muvClient.js'
import {
  crearTokenSandbox,
  invalidarCacheSispro,
  withCachedSisproToken,
} from './SisproAuthService.js'

/**
 * Sandbox (o sin credenciales de Mi Seguridad Social) no llama al Ministerio.
 * Así el cliente offline sigue operando y, al configurar el ambiente, sale a la red.
 */
export function shouldUseMinsaludSandbox() {
  return config.minsalud.sandbox || !hasMinsaludCredentials()
}

/**
 * Credenciales de Profesional Independiente (usuario y clave de Mi Seguridad Social / SISPRO).
 */
export function buildCredencialesProfesionalIndependiente(override) {
  if (override) return override
  const {
    tipoDocumento,
    numDocumento,
    username,
    password,
    nit,
    codPrestadorReps,
    tipoPrestador,
  } = config.minsalud

  const credenciales = {
    persona: {
      identificacion: {
        tipo: tipoDocumento || 'CC',
        numero: numDocumento || username || '',
      },
    },
    clave: password || '',
    nit: nit || '',
    tipoUsuario: 'RE',
    tipoPrestador: tipoPrestador || 'independiente',
  }

  if (codPrestadorReps) credenciales.codPrestador = codPrestadorReps

  if (shouldUseMinsaludSandbox()) {
    if (!credenciales.persona.identificacion.numero) {
      credenciales.persona.identificacion.numero = '0000000000'
    }
    if (!credenciales.clave) credenciales.clave = 'sandbox-reps'
    if (!credenciales.nit) credenciales.nit = '900000000'
  }

  return credenciales
}

/**
 * Cuerpo de 8.1 LoginSispro. `tipoUsuario: "RE"` identifica al profesional independiente
 * (representante de entidad) cuyo documento no coincide con el NIT de la DIAN.
 */
export function cuerpoLogin(credenciales) {
  return {
    persona: {
      identificacion: {
        tipo: credenciales.tipo ?? credenciales.persona?.identificacion?.tipo,
        numero: credenciales.numero ?? credenciales.persona?.identificacion?.numero,
      },
    },
    clave: credenciales.clave,
    nit: credenciales.nit,
    tipoUsuario: credenciales.tipoUsuario || 'RE',
  }
}

/**
 * Autenticación contra el MUV del ambiente activo (pruebas serie 5.x o producción).
 * Guarda el Bearer token con el TTL de SisproAuthService.
 */
export class MinSaludAuthService {
  /**
   * @param {{ loginSispro: Function }} [client]
   */
  constructor(client = muvClient) {
    this.client = client
  }

  ambiente() {
    return resolveMuvAmbiente()
  }

  /**
   * POST {base}/api/Auth/LoginSISPRO con el usuario y la clave del profesional independiente.
   * @param {object} credenciales
   */
  async solicitarTokenAlMinisterio(credenciales) {
    if (shouldUseMinsaludSandbox()) {
      return crearTokenSandbox(credenciales)
    }
    const session = await this.client.loginSispro(cuerpoLogin(credenciales))
    return { token: session.token, expiresIn: session.expiresIn }
  }

  /**
   * Devuelve un JWT vigente. Si el cache expiró, repite el login.
   * @param {object} [credencialesDescifradas]
   * @returns {Promise<string>}
   */
  async obtenerToken(credencialesDescifradas) {
    const credenciales = buildCredencialesProfesionalIndependiente(credencialesDescifradas)
    return withCachedSisproToken(credenciales, (normalizadas) => this.solicitarTokenAlMinisterio(normalizadas))
  }

  /** @param {object} [credencialesDescifradas] */
  invalidar(credencialesDescifradas) {
    invalidarCacheSispro(credencialesDescifradas)
  }
}

export const minSaludAuth = new MinSaludAuthService()

export async function obtenerTokenSISPRO(credencialesDescifradas) {
  return minSaludAuth.obtenerToken(credencialesDescifradas)
}

export function clearMinsaludTokenCache(credencialesDescifradas) {
  minSaludAuth.invalidar(credencialesDescifradas)
}

export function buildLoginSisproRequest() {
  const ambiente = resolveMuvAmbiente()
  return {
    method: 'POST',
    url: `${ambiente.apiBaseUrl}${ambiente.authPath}`,
    path: ambiente.authPath,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: cuerpoLogin(buildCredencialesProfesionalIndependiente()),
  }
}
