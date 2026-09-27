import { config, hasMinsaludCredentials } from '../config.js'
import { invalidarCacheSispro, obtenerBearerToken } from './SisproAuthService.js'

/**
 * Sandbox (o sin credenciales de producción) no llama al Ministerio.
 */
export function shouldUseMinsaludSandbox() {
  return config.minsalud.sandbox || !hasMinsaludCredentials()
}

/**
 * Credenciales de Profesional Independiente habilitado en REPS para LoginSISPRO.
 */
export function buildCredencialesProfesionalIndependiente() {
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
        numero: numDocumento || username || '0000000000',
      },
    },
    clave: password || 'sandbox-reps',
    nit: nit || '900000000',
    tipoPrestador: tipoPrestador || 'independiente',
  }

  if (codPrestadorReps) {
    credenciales.codPrestador = codPrestadorReps
  }

  return credenciales
}

/**
 * POST /api/Auth/LoginSISPRO — cuerpo y URL del login oficial.
 */
export function buildLoginSisproRequest() {
  const path = config.minsalud.authPath || '/api/Auth/LoginSISPRO'
  const url = config.minsalud.authUrl || (config.minsalud.apiBaseUrl ? `${config.minsalud.apiBaseUrl}${path}` : path)
  return {
    method: 'POST',
    url,
    path,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: buildCredencialesProfesionalIndependiente(),
  }
}

/**
 * Obtiene el Bearer token SISPRO del prestador.
 * Si no llegan credenciales descifradas, usa las del entorno (sandbox / producción).
 * @param {object} [credencialesDescifradas]
 */
export async function obtenerTokenSISPRO(credencialesDescifradas) {
  const credenciales = credencialesDescifradas ?? buildCredencialesProfesionalIndependiente()
  return obtenerBearerToken(credenciales)
}

export function clearMinsaludTokenCache(credencialesDescifradas) {
  invalidarCacheSispro(credencialesDescifradas)
}
