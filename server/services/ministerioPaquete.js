import { randomBytes } from 'node:crypto'
import { GZIP_UMBRAL_BYTES, muvClient } from './muvClient.js'
import {
  buildCredencialesProfesionalIndependiente,
  minSaludAuth,
  shouldUseMinsaludSandbox,
} from './MinSaludAuthService.js'
import { construirPaqueteCargarFevRips } from './MinSaludService.js'
import { vencimientoCacheSispro } from './SisproAuthService.js'
import { TOKEN_VIGENCIA_MS, esRechazoTot003 } from '../../shared/ministerioSesion.js'

function usarSandbox(opciones) {
  if (opciones?.sandbox === false) return false
  if (opciones?.sandbox === true) return true
  return shouldUseMinsaludSandbox()
}

/**
 * Credenciales de LoginSISPRO. La clave sale de la configuración del servidor
 * cuando el llamador no la trae: el navegador no debe enviarla.
 */
export function armarCredencialesMinisterio({
  tipoUsuario,
  documento,
  nit,
  clave,
  tipoDocumento,
} = {}) {
  const base = buildCredencialesProfesionalIndependiente()
  const numero = String(documento || base.persona?.identificacion?.numero || '').trim()
  const nitLimpio = String(nit || base.nit || '').replace(/\D/g, '')
  return {
    tipo: String(tipoDocumento || base.persona?.identificacion?.tipo || 'CC').trim().toUpperCase() || 'CC',
    numero,
    clave: clave || base.clave,
    nit: nitLimpio,
    tipoUsuario: String(tipoUsuario || base.tipoUsuario || 'RE').trim() || 'RE',
    tipoPrestador: 'independiente',
  }
}

function mensajeAuth(error) {
  return (
    error?.response?.data?.mensaje ||
    error?.details?.[0]?.message ||
    error?.details?.[0]?.descripcion ||
    error?.message ||
    'No se pudo obtener el token.'
  )
}

/**
 * Sesión vigente. La caché la reutiliza si aún le quedan más de 5 minutos,
 * con tope de 1 h 55 min para no chocar con las 2 horas del Ministerio.
 */
export async function obtenerSesionMinisterio(tipoUsuario, documento, nit, clave, opciones = {}) {
  const credenciales = armarCredencialesMinisterio({
    tipoUsuario,
    documento,
    nit,
    clave,
    tipoDocumento: opciones.tipoDocumento,
  })

  if (opciones.auth) {
    const token = await opciones.auth.obtenerToken(credenciales)
    const expiresAt = opciones.auth.vencimiento?.(credenciales) ?? Date.now() + TOKEN_VIGENCIA_MS
    return { token, expiresAt }
  }

  const token = await minSaludAuth.obtenerToken(credenciales)
  const expiresAt = vencimientoCacheSispro(credenciales) ?? Date.now()
  return { token, expiresAt }
}

/**
 * Obtiene o reutiliza el token de acceso del Ministerio (vigencia máxima: 2 horas).
 * @param {string} tipoUsuario
 * @param {string} documento
 * @param {string} nit
 * @param {string} [clave]
 * @param {object} [opciones]
 * @returns {Promise<string>}
 */
export async function obtenerTokenMinisterio(tipoUsuario, documento, nit, clave, opciones = {}) {
  try {
    const sesion = await obtenerSesionMinisterio(tipoUsuario, documento, nit, clave, opciones)
    return sesion.token
  } catch (error) {
    if (String(error?.message ?? '').startsWith('Error al autenticar con el Ministerio de Salud:')) {
      throw error
    }
    const wrapped = new Error(`Error al autenticar con el Ministerio de Salud: ${mensajeAuth(error)}`)
    wrapped.status = error?.status || 502
    throw wrapped
  }
}

function invalidarSesion(credenciales, opciones) {
  if (opciones.auth?.invalidar) {
    opciones.auth.invalidar(credenciales)
    return
  }
  minSaludAuth.invalidar(credenciales)
}

async function cargarConToken(client, paquete, credenciales, opciones, gzip, reintento) {
  const token = await obtenerTokenMinisterio(
    credenciales.tipoUsuario,
    credenciales.documento,
    credenciales.nit,
    credenciales.clave,
    opciones,
  )
  try {
    const result = await client.cargarFevRips(paquete, { token, gzip })
    return (
      result?.raw ?? {
        ResultState: true,
        CodigoUnicoValidacion: result?.cuv ?? null,
        ProcesoId: result?.procesoId ?? null,
        FechaRadicacion: result?.fechaRadicacion ?? null,
        ResultadosValidacion: result?.notificaciones ?? [],
      }
    )
  } catch (error) {
    if (!reintento && esRechazoTot003(error)) {
      invalidarSesion(armarCredencialesMinisterio(credenciales), opciones)
      return cargarConToken(client, paquete, credenciales, opciones, gzip, true)
    }
    throw error
  }
}

/**
 * Envía el paquete combinado de FEV (XML) y RIPS (JSON) al Ministerio.
 * El cuerpo oficial es `{ rips, xmlFevFile }` con Authorization Bearer.
 * Ante TOT003 descarta el token y vuelve a autenticarse una sola vez.
 * Con sandbox activo no llama a stage-fevrips.sispro.gov.co.
 */
export async function enviarPaqueteAlMinisterio(xmlFev, jsonRips, credenciales = {}, opciones = {}) {
  let rips
  try {
    rips = typeof jsonRips === 'string' ? JSON.parse(jsonRips) : jsonRips
  } catch {
    return { success: false, error: 'El JSON RIPS no se pudo leer.' }
  }
  if (!rips || typeof rips !== 'object' || Array.isArray(rips)) {
    return { success: false, error: 'El JSON RIPS no se pudo leer.' }
  }

  const paquete = construirPaqueteCargarFevRips({
    rips,
    xml: xmlFev,
    xmlFevFile: xmlFev,
  })
  const gzip =
    Boolean(opciones.gzip) || Buffer.byteLength(JSON.stringify(paquete)) > GZIP_UMBRAL_BYTES

  if (usarSandbox(opciones)) {
    try {
      await obtenerTokenMinisterio(
        credenciales.tipoUsuario,
        credenciales.documento,
        credenciales.nit,
        credenciales.clave,
        opciones,
      )
    } catch (error) {
      return { success: false, error: error.message }
    }
    return {
      success: true,
      data: {
        ResultState: true,
        CodigoUnicoValidacion: randomBytes(48).toString('hex'),
        ProcesoId: Date.now(),
        NumFactura: rips.numFactura ?? null,
        FechaRadicacion: new Date().toISOString(),
        ResultadosValidacion: [],
      },
    }
  }

  const client = opciones.client ?? muvClient
  try {
    const data = await cargarConToken(client, paquete, credenciales, opciones, gzip, false)
    return { success: true, data }
  } catch (error) {
    return {
      success: false,
      error: error?.details?.length
        ? error.details
        : error?.glosas?.length
          ? error.glosas
          : error?.message || 'Error al enviar el paquete al Ministerio de Salud.',
    }
  }
}
