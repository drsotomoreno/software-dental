/**
 * Transmisión real de paquetes RIPS multiusuario al API FEV-RIPS de SISPRO.
 * Modalidad RS (sin factura): no se adjunta xmlFev.
 */
import { gzipSync } from 'node:zlib'
import { config } from '../config.js'
import { hasBlockingValidationErrors, validateRipsPackageLocally } from './ripsLocalValidator.js'
import { enqueueMinistryResponse } from './cuvWatcher.js'
import {
  FEVRIPS_PATHS,
  FEVRIPS_PRODUCTION_BASE_URL,
  buildFevRipsRequestBody,
  buildLoginSisproBody,
  classifyMinistryResponse,
  resolveCredenciales,
} from './fevRipsProtocol.js'
import { PERFIL_FISCAL_NO_OBLIGADO } from '../../shared/fiscalProfile.js'

const GZIP_THRESHOLD_BYTES = 50 * 1024 * 1024

let cachedToken = null
let tokenExpiresAt = 0

export function fevRipsBaseUrl() {
  const configured = String(config.minsalud.apiBaseUrl ?? '').replace(/\/$/, '')
  return configured || FEVRIPS_PRODUCTION_BASE_URL
}

/**
 * Credenciales del prestador: entorno seguro, con anulación puntual por argumento.
 * tipoUsuario "NIT" del bosquejo se interpreta como tipo de documento, no como mecanismo RE/PIN.
 * @param {object} [overrides]
 * @param {object} [rips]
 */
export function credencialesDesdeConfig(overrides = {}, rips) {
  const minsalud = config.minsalud
  return resolveCredenciales(
    {
      tipoDocumento: overrides.tipoDocumento || minsalud.tipoDocumento,
      tipoUsuario: overrides.tipoUsuario || minsalud.tipoUsuario,
      numeroDocumento: overrides.numeroDocumento || minsalud.numeroDocumento || minsalud.username,
      nitObligado: overrides.nitObligado || overrides.nit || minsalud.nit || rips?.numDocumentoIdObligado,
      clave: overrides.clave || overrides.password || minsalud.password,
    },
    rips,
  )
}

export function clearSisproTokenCache() {
  cachedToken = null
  tokenExpiresAt = 0
}

function encodeRequestBody(body) {
  const json = JSON.stringify(body)
  const forceGzip = String(process.env.MINSALUD_FORCE_GZIP ?? '').toLowerCase() === 'true'
  if (forceGzip || Buffer.byteLength(json) > GZIP_THRESHOLD_BYTES) {
    return {
      body: gzipSync(Buffer.from(json)),
      headers: {
        'Content-Type': 'application/json',
        'Content-Encoding': 'gzip',
      },
    }
  }
  return {
    body: json,
    headers: { 'Content-Type': 'application/json' },
  }
}

async function readResponseBody(response) {
  const text = await response.text()
  if (!text) return {}
  try {
    return JSON.parse(text)
  } catch {
    return { message: text.slice(0, 500) }
  }
}

function tokenFromLogin(data) {
  return data?.token ?? data?.Token ?? data?.access_token ?? null
}

async function loginSispro(credenciales) {
  if (cachedToken && Date.now() < tokenExpiresAt - 60_000) return cachedToken

  if (!credenciales.clave || !credenciales.numeroDocumento || !credenciales.nitObligado) {
    const error = new Error(
      'Faltan credenciales SISPRO (número de documento, NIT y clave). Defínalas en el entorno, no en el código.',
    )
    error.code = 'SISPRO_CREDENTIALS'
    throw error
  }

  const url = `${fevRipsBaseUrl()}${FEVRIPS_PATHS.login}`
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(buildLoginSisproBody(credenciales)),
    signal: AbortSignal.timeout(60_000),
  })
  const data = await readResponseBody(response)
  const token = tokenFromLogin(data)
  if (!response.ok || !token || data.login === false) {
    const detail = Array.isArray(data.errors) ? data.errors.join(' ') : data.message
    const error = new Error(detail || 'Autenticación SISPRO fallida')
    error.status = response.status || 502
    throw error
  }

  cachedToken = token
  const expiresIn = Number(data.expires_in ?? data.expiresIn ?? 3600)
  tokenExpiresAt = Date.now() + (Number.isFinite(expiresIn) ? expiresIn : 3600) * 1000
  return cachedToken
}

function errorMessage(classified, fallback) {
  const rows = classified.ministryErrors ?? []
  const text = rows
    .map((item) => item.message)
    .filter(Boolean)
    .join(' ')
  return text || fallback
}

/**
 * Envía un paquete RIPS con uno o varios usuarios al Ministerio.
 * En modalidad RS se omite el XML de la FEV (xmlFevFile vacío).
 *
 * @param {object} rips Paquete Res. 2275 (usuarios[])
 * @param {object} [credencialesPrestador] tipoUsuario/tipoDocumento, numeroDocumento, nitObligado, clave
 * @param {string} [xmlFev] AttachedDocument. Omitir en RS.
 * @returns {Promise<{ success: boolean, data?: object, error?: string, localIssues?: object[], ministryErrors?: object[] }>}
 */
export async function transmitirRipsMultiusuario(rips, credencialesPrestador = {}, xmlFev) {
  const built = buildFevRipsRequestBody(rips, xmlFev)
  if (built.error) {
    return { success: false, error: built.error, ministryErrors: [], localIssues: [] }
  }

  const sinFactura = built.operacion.sinFactura
  const localIssues = validateRipsPackageLocally(built.body.rips, {
    allowNullNumFactura: sinFactura,
    esRipsTemporal: sinFactura,
    perfilFiscal: sinFactura ? PERFIL_FISCAL_NO_OBLIGADO : undefined,
    crossValidateAgeSex: true,
  })
  if (hasBlockingValidationErrors(localIssues)) {
    return {
      success: false,
      error: 'El RIPS no cumple validaciones locales antes del envío al Ministerio.',
      localIssues,
      ministryErrors: [],
    }
  }

  const credenciales = credencialesDesdeConfig(credencialesPrestador, built.body.rips)

  let token
  try {
    token = await loginSispro(credenciales)
  } catch (error) {
    clearSisproTokenCache()
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Autenticación SISPRO fallida',
      localIssues,
      ministryErrors: [],
    }
  }

  const url = `${fevRipsBaseUrl()}${built.operacion.path}`
  const encoded = encodeRequestBody(built.body)
  let response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        ...encoded.headers,
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: encoded.body,
      signal: AbortSignal.timeout(180_000),
    })
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'No hubo respuesta de SISPRO.',
      localIssues,
      ministryErrors: [],
    }
  }
  const data = await readResponseBody(response)
  const classified = classifyMinistryResponse(data)

  if (!response.ok || !classified.approved) {
    if (response.status === 401) clearSisproTokenCache()
    return {
      success: false,
      error: errorMessage(
        classified,
        `El Ministerio no radicó el paquete (HTTP ${response.status}).`,
      ),
      localIssues,
      ministryErrors: classified.ministryErrors,
      data,
    }
  }

  await enqueueMinistryResponse(data, {
    origen: sinFactura ? 'rips-sin-factura' : built.operacion.modulo,
    numDocumentoIdObligado: built.body.rips.numDocumentoIdObligado,
    numFactura: classified.numFactura ?? built.body.rips.numFactura ?? null,
    numNota: built.body.rips.numNota ?? null,
  }).catch((error) => {
    console.error('[Ministerio] No se pudo encolar el archivo CUV:', error?.message ?? error)
  })

  return {
    success: true,
    data: {
      cuv: classified.cuv,
      procesoId: classified.procesoId,
      numFactura: classified.numFactura,
      fechaRadicacion: classified.fechaRadicacion ?? new Date().toISOString(),
      estado: 'APROBADO',
      modulo: classified.modulo ?? built.operacion.modulo,
      ambiente: classified.ambiente,
      rutaArchivos: classified.rutaArchivos,
      notificaciones: classified.notificaciones,
      raw: data,
    },
    localIssues: localIssues.filter((issue) => issue.level === 'warning'),
    ministryErrors: [],
  }
}
