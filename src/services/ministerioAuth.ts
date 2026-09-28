import { getStoredApiAuth } from '@/services/apiAuthService'
import {
  HOST_STAGE_FEVRIPS,
  esRechazoTot003,
  tokenSigueVigente,
} from '../../shared/ministerioSesion.js'

/**
 * Ambiente de pruebas del Ministerio (serie 5.x).
 * El navegador no llama este host: LoginSISPRO y CargarFevRips salen del servidor,
 * que es quien guarda la clave y evita el bloqueo CORS.
 */
export const MSPS_BASE_URL = HOST_STAGE_FEVRIPS

const API_BASE = import.meta.env.VITE_RIPS_API_URL ?? '/api/rips'

export interface AuthTokenResponse {
  token: string
  /** Timestamp en milisegundos. */
  expiresAt: number
}

export interface CredencialesMinisterio {
  tipoUsuario: string
  documento: string
  nit: string
}

export interface ResultadoEnvioMinisterio {
  success: boolean
  data?: unknown
  error?: unknown
}

const sessionCache = new Map<string, AuthTokenResponse>()

function claveSesion(tipoUsuario: string, documento: string, nit: string) {
  return `${tipoUsuario}|${documento}|${String(nit).replace(/\D/g, '')}`
}

function identityHeaders(): Record<string, string> {
  if (typeof localStorage === 'undefined') return {}
  const auth = getStoredApiAuth()
  return {
    ...(auth?.token ? { Authorization: `Bearer ${auth.token}` } : {}),
    ...(auth?.user?.email ? { 'X-Client-Email': String(auth.user.email) } : {}),
    ...(auth?.user?.id ? { 'X-Client-User-Id': String(auth.user.id) } : {}),
    ...(auth?.user?.documentNumber
      ? { 'X-Client-Document': String(auth.user.documentNumber) }
      : {}),
  }
}

function leerCache(tipoUsuario: string, documento: string, nit: string) {
  const clave = claveSesion(tipoUsuario, documento, nit)
  const sesion = sessionCache.get(clave)
  if (!sesion || !tokenSigueVigente(sesion.expiresAt)) {
    sessionCache.delete(clave)
    return null
  }
  return sesion.token
}

function guardarCache(tipoUsuario: string, documento: string, nit: string, sesion: AuthTokenResponse) {
  if (!tokenSigueVigente(sesion.expiresAt)) return
  sessionCache.set(claveSesion(tipoUsuario, documento, nit), sesion)
}

export function limpiarCacheTokenMinisterio() {
  sessionCache.clear()
}

async function leerJson(response: Response): Promise<Record<string, unknown>> {
  try {
    return (await response.json()) as Record<string, unknown>
  } catch {
    return {}
  }
}

/**
 * Obtiene o reutiliza el token de acceso del Ministerio (vigencia máxima: 2 horas).
 * Se reutiliza solo si le quedan más de 5 minutos, para no recibir TOT003.
 */
export async function obtenerTokenMinisterio(
  tipoUsuario: string,
  documento: string,
  nit: string,
): Promise<string> {
  const vigente = leerCache(tipoUsuario, documento, nit)
  if (vigente) return vigente

  let response: Response
  try {
    response = await fetch(`${API_BASE}/ministerio/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...identityHeaders() },
      body: JSON.stringify({ tipoUsuario, documento, nit }),
    })
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : 'sin conexión'
    throw new Error(`Error al autenticar con el Ministerio de Salud: ${mensaje}`)
  }

  const data = await leerJson(response)
  if (!response.ok || typeof data.token !== 'string' || !data.token) {
    const mensaje =
      (typeof data.error === 'string' && data.error) ||
      (typeof data.mensaje === 'string' && data.mensaje) ||
      `HTTP ${response.status}`
    const texto = mensaje.startsWith('Error al autenticar con el Ministerio de Salud:')
      ? mensaje
      : `Error al autenticar con el Ministerio de Salud: ${mensaje}`
    throw new Error(texto)
  }

  const expiresAt = typeof data.expiresAt === 'number' ? data.expiresAt : Date.now()
  guardarCache(tipoUsuario, documento, nit, { token: data.token, expiresAt })
  return data.token
}

async function enviar(
  xmlFev: string,
  jsonRips: string,
  credenciales: CredencialesMinisterio,
  reintento: boolean,
): Promise<ResultadoEnvioMinisterio> {
  try {
    await obtenerTokenMinisterio(credenciales.tipoUsuario, credenciales.documento, credenciales.nit)
    const response = await fetch(`${API_BASE}/ministerio/paquete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...identityHeaders() },
      body: JSON.stringify({ xmlFev, jsonRips, credenciales }),
    })
    const data = await leerJson(response)
    const result: ResultadoEnvioMinisterio = {
      success: data.success === true,
      data: data.data,
      error: data.error,
    }
    if (!result.success && !reintento && esRechazoTot003(result.error)) {
      sessionCache.delete(claveSesion(credenciales.tipoUsuario, credenciales.documento, credenciales.nit))
      return enviar(xmlFev, jsonRips, credenciales, true)
    }
    if (!response.ok && result.error == null) {
      return { success: false, error: `HTTP ${response.status}` }
    }
    return result
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Error al enviar el paquete al Ministerio de Salud.',
    }
  }
}

/**
 * Envía el paquete combinado de FEV (XML) y RIPS (JSON) al Ministerio.
 * El servidor lo entrega como `{ rips, xmlFevFile }` a CargarFevRips, con Bearer.
 */
export async function enviarPaqueteAlMinisterio(
  xmlFev: string,
  jsonRips: string,
  credenciales: CredencialesMinisterio,
): Promise<ResultadoEnvioMinisterio> {
  return enviar(xmlFev, jsonRips, credenciales, false)
}
