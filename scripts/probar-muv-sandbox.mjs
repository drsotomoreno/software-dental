#!/usr/bin/env node
/**
 * Prueba aislada contra el ambiente Stage del Mecanismo Único de Validación (MUV).
 *
 * Contrato vigente (manual API-Docker FEV-RIPS v4.3 y host de pruebas del Ministerio):
 *   POST {base}/api/Auth/LoginSISPRO
 *   POST {base}/api/PaquetesFevRips/CargarRipsSinFactura
 *
 * Credenciales en .env (plantilla: .env.example):
 *   MINSALUD_USERNAME          número de documento SISPRO (obligatorio)
 *   MINSALUD_PASSWORD          clave (obligatorio)
 *   MINSALUD_NIT               NIT del prestador (obligatorio)
 *   MINSALUD_TIPO_DOCUMENTO    CC por defecto
 *   MINSALUD_TIPO_USUARIO      opcional: RE, PIN, PINx, PIE
 *   MINSALUD_COD_PRESTADOR     REPS de la sede, 12 dígitos
 *   MINSALUD_XML_FEV_PATH      si se define, envía CargarFevRips con el XML en Base64
 *
 * Uso: npm run muv:sandbox
 */

import 'dotenv/config'
import http from 'node:http'
import https from 'node:https'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import {
  hasBlockingValidationErrors,
  validateRipsPackageLocally,
} from '../server/services/ripsLocalValidator.js'

const SANDBOX_BASE_URL = 'https://stage-fevrips.sispropreprod.gov.co/fevrips-api'
const PRODUCTION_BASE_URL = 'https://fevrips.sispro.gov.co/fevrips-api'
const LOGIN_PATH = '/api/Auth/LoginSISPRO'
const CARGAR_SIN_FACTURA_PATH = '/api/PaquetesFevRips/CargarRipsSinFactura'
const CARGAR_FEV_PATH = '/api/PaquetesFevRips/CargarFevRips'
const DEFAULT_APP_VERSION = '5.4.11'
const DEFAULT_TIPO_MECANISMO = 1
const DEFAULT_COD_PRESTADOR = '680010389801'
const DEFAULT_PACIENTE_DOCUMENTO = '1020708099'
const CRITICAL_ENV = ['MINSALUD_USERNAME', 'MINSALUD_PASSWORD', 'MINSALUD_NIT']
const MISSING_CREDENTIALS_MESSAGE =
  'Error: Faltan credenciales del MUV. Por favor, copia el archivo .env.example como .env y configura los datos de prueba del prestador.'

function env(name) {
  const value = process.env[name]
  return typeof value === 'string' ? value.trim() : ''
}

function assertMuvCredentials() {
  const missing = CRITICAL_ENV.filter((name) => !env(name))
  if (missing.length === 0) return
  console.error(`\x1b[31m${MISSING_CREDENTIALS_MESSAGE}\x1b[0m`)
  process.exit(1)
}

function digitsOnly(value) {
  return String(value ?? '').replace(/\D/g, '')
}

function joinUrl(base, path) {
  const root = base.replace(/\/$/, '')
  const suffix = path.startsWith('/') ? path : `/${path}`
  return `${root}${suffix}`
}

function isLocalHttps(url) {
  return /^https:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/i.test(url)
}

function formatBogotaDateTime(date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const pick = (type) => parts.find((part) => part.type === type)?.value ?? '00'
  return `${pick('year')}-${pick('month')}-${pick('day')} ${pick('hour')}:${pick('minute')}`
}

function readSettings() {
  const sandbox = env('MINSALUD_SANDBOX') !== 'false'
  const baseUrl = (env('MINSALUD_API_BASE_URL') || (sandbox ? SANDBOX_BASE_URL : PRODUCTION_BASE_URL)).replace(
    /\/$/,
    '',
  )
  const explicitValidateUrl = env('MINSALUD_VALIDATE_URL')
  const xmlPath = env('MINSALUD_XML_FEV_PATH')
  const cargarPath = explicitValidateUrl || (xmlPath ? CARGAR_FEV_PATH : CARGAR_SIN_FACTURA_PATH)

  return {
    sandbox,
    baseUrl,
    loginUrl: env('MINSALUD_AUTH_URL') || joinUrl(baseUrl, LOGIN_PATH),
    cargarUrl: cargarPath.startsWith('http') ? cargarPath : joinUrl(baseUrl, cargarPath),
    tipoDocumento: (env('MINSALUD_TIPO_DOCUMENTO') || 'CC').toUpperCase(),
    numeroDocumento: env('MINSALUD_USERNAME'),
    clave: env('MINSALUD_PASSWORD'),
    nit: digitsOnly(env('MINSALUD_NIT')),
    tipoUsuario: env('MINSALUD_TIPO_USUARIO').toUpperCase(),
    codPrestador: digitsOnly(env('MINSALUD_COD_PRESTADOR') || DEFAULT_COD_PRESTADOR),
    appVersion: env('MINSALUD_APP_VERSION') || DEFAULT_APP_VERSION,
    tipoMecanismoValidacion: Number(env('MINSALUD_TIPO_MECANISMO') || DEFAULT_TIPO_MECANISMO),
    xmlPath,
    pacienteDocumento: digitsOnly(env('MINSALUD_PACIENTE_DOCUMENTO') || DEFAULT_PACIENTE_DOCUMENTO),
  }
}

/**
 * RIPS mínimo de una consulta odontológica.
 * Estructura del ejemplo oficial de CargarRipsSinFactura (Res. 2275),
 * con CUPS 890203 (consulta de primera vez por odontología general).
 * @param {ReturnType<typeof readSettings>} settings
 */
export function buildMinimalRips(settings) {
  const conFactura = Boolean(settings.xmlPath)
  const atencion = formatBogotaDateTime(new Date(Date.now() - 30 * 60 * 1000))
  const profesionalDocumento = /^\d{3,10}$/.test(settings.numeroDocumento)
    ? settings.numeroDocumento
    : '1020304050'

  return {
    numDocumentoIdObligado: settings.nit || '900123456',
    numFactura: conFactura ? `FV${atencion.slice(0, 10).replace(/-/g, '')}1` : null,
    tipoNota: conFactura ? null : 'RS',
    numNota: conFactura ? null : `RS${Date.now()}`,
    usuarios: [
      {
        tipoDocumentoIdentificacion: 'CC',
        numDocumentoIdentificacion: settings.pacienteDocumento,
        tipoUsuario: '04',
        fechaNacimiento: '1991-06-25',
        codSexo: 'F',
        codPaisResidencia: '170',
        codMunicipioResidencia: '11001',
        codZonaTerritorialResidencia: '02',
        incapacidad: 'NO',
        consecutivo: 1,
        codPaisOrigen: '170',
        servicios: {
          consultas: [
            {
              codPrestador: settings.codPrestador,
              fechaInicioAtencion: atencion,
              numAutorizacion: null,
              codConsulta: '890203',
              modalidadGrupoServicioTecSal: '01',
              grupoServicios: '01',
              codServicio: 344,
              finalidadTecnologiaSalud: '11',
              causaMotivoAtencion: '38',
              codDiagnosticoPrincipal: 'K021',
              codDiagnosticoRelacionado1: null,
              codDiagnosticoRelacionado2: null,
              codDiagnosticoRelacionado3: null,
              tipoDiagnosticoPrincipal: '02',
              tipoDocumentoIdentificacion: settings.tipoDocumento || 'CC',
              numDocumentoIdentificacion: profesionalDocumento,
              vrServicio: 0,
              conceptoRecaudo: '05',
              valorPagoModerador: 0,
              numFEVPagoModerador: null,
              consecutivo: 1,
            },
          ],
        },
      },
    ],
  }
}

function buildLoginBody(settings) {
  const body = {
    persona: {
      identificacion: {
        tipo: settings.tipoDocumento,
        numero: settings.numeroDocumento,
      },
    },
    clave: settings.clave,
    nit: settings.nit,
    appVersion: settings.appVersion,
    tipoMecanismoValidacion: settings.tipoMecanismoValidacion,
  }
  if (settings.tipoUsuario) body.tipoUsuario = settings.tipoUsuario
  return body
}

function requestJson(url, { method = 'POST', headers = {}, body } = {}) {
  const target = new URL(url)
  const payload = body === undefined ? null : JSON.stringify(body)
  const lib = target.protocol === 'https:' ? https : http
  const requestHeaders = { ...headers }
  if (payload !== null) requestHeaders['Content-Length'] = Buffer.byteLength(payload)

  return new Promise((resolve, reject) => {
    const req = lib.request(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port || undefined,
        path: `${target.pathname}${target.search}`,
        method,
        headers: requestHeaders,
        rejectUnauthorized: !isLocalHttps(url),
      },
      (response) => {
        const chunks = []
        response.on('data', (chunk) => chunks.push(chunk))
        response.on('end', () => {
          const rawText = Buffer.concat(chunks).toString('utf8')
          let data = null
          if (rawText) {
            try {
              data = JSON.parse(rawText)
            } catch {
              data = { message: rawText }
            }
          }
          resolve({
            response: { status: response.statusCode ?? 0, ok: (response.statusCode ?? 0) < 400 },
            data,
            rawText,
          })
        })
      },
    )
    req.on('error', reject)
    if (payload !== null) req.write(payload)
    req.end()
  })
}

function loginErrors(data) {
  if (!data || typeof data !== 'object') return []
  if (Array.isArray(data.errors)) return data.errors.map(String)
  if (Array.isArray(data.Errors)) return data.Errors.map(String)
  if (data.Errors && typeof data.Errors === 'object') {
    return Object.entries(data.Errors).flatMap(([field, messages]) => {
      const list = Array.isArray(messages) ? messages : [messages]
      return list.map((message) => `${field}: ${message}`)
    })
  }
  if (typeof data.message === 'string') return [data.message]
  if (typeof data.Detail === 'string') return [data.Detail]
  return []
}

function extractToken(data) {
  if (!data || typeof data !== 'object') return ''
  return String(data.token ?? data.Token ?? data.access_token ?? data.JWTToken ?? '').trim()
}

async function authenticate(settings) {
  const { response, data } = await requestJson(settings.loginUrl, {
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: buildLoginBody(settings),
  })

  const token = extractToken(data)
  const accepted = response.ok && data?.login === true && Boolean(token)
  return { response, data, token, accepted, errors: loginErrors(data) }
}

function validationItems(data) {
  const items = data?.ResultadosValidacion ?? data?.resultadosValidacion ?? []
  return Array.isArray(items) ? items : []
}

function itemClase(item) {
  return String(item?.Clase ?? item?.clase ?? '').toUpperCase()
}

function isRealCuv(value) {
  const cuv = String(value ?? '').trim()
  return /^[a-f0-9]{32,}$/i.test(cuv.replace(/\s/g, ''))
}

function printRule(item, index) {
  const clase = itemClase(item) || 'SIN_CLASE'
  const codigo = item?.Codigo ?? item?.codigo ?? '—'
  const descripcion = item?.Descripcion ?? item?.descripcion ?? item?.message ?? 'Sin descripción'
  const observaciones = item?.Observaciones ?? item?.observaciones ?? ''
  const path = item?.PathFuente ?? item?.pathFuente ?? item?.Path ?? ''
  const fuente = item?.Fuente ?? item?.fuente ?? ''
  console.log(`  ${index + 1}. [${clase}] ${codigo}`)
  console.log(`     ${descripcion}`)
  if (observaciones) console.log(`     Observaciones: ${observaciones}`)
  if (path) console.log(`     Path: ${path}`)
  if (fuente) console.log(`     Fuente: ${fuente}`)
}

export function printMuvResponse({ httpStatus, data }) {
  const resultState = data?.ResultState ?? data?.resultState
  const cuv = data?.CodigoUnicoValidacion ?? data?.codigoUnicoValidacion ?? data?.CUV ?? data?.cuv
  const cuvVisible = data?.CodigoUnicoValidacionToShow ?? data?.codigoUnicoValidacionToShow
  const items = validationItems(data)
  const rechazos = items.filter((item) => itemClase(item) === 'RECHAZADO')
  const notificaciones = items.filter((item) => itemClase(item) === 'NOTIFICACION')
  const otras = items.filter((item) => !['RECHAZADO', 'NOTIFICACION'].includes(itemClase(item)))
  const approved = resultState === true && isRealCuv(cuv)

  console.log('')
  console.log('── Respuesta del MUV ──')
  console.log(`HTTP: ${httpStatus}`)
  console.log(`ResultState: ${resultState === undefined ? '(ausente)' : String(resultState)}`)
  console.log(`Ambiente: ${data?.Ambiente ?? data?.ambiente ?? '(no informado)'}`)
  console.log(`Módulo: ${data?.Modulo ?? data?.modulo ?? '(no informado)'}`)
  console.log(`ProcesoId: ${data?.ProcesoId ?? data?.procesoId ?? '(no informado)'}`)
  console.log(`NumFactura: ${data?.NumFactura ?? data?.numFactura ?? '(no informado)'}`)
  console.log(`FechaRadicacion: ${data?.FechaRadicacion ?? data?.fechaRadicacion ?? '(no informada)'}`)

  if (approved) {
    console.log('')
    console.log('CUV:')
    console.log(String(cuv).replace(/\s/g, ''))
  } else if (cuvVisible) {
    console.log('')
    console.log('CUV:')
    console.log(cuvVisible)
  } else if (cuv && cuv !== '-') {
    console.log('')
    console.log('CUV:')
    console.log(cuv)
  }

  if (rechazos.length > 0) {
    console.log('')
    console.log(`Rechazos (${rechazos.length}):`)
    rechazos.forEach(printRule)
  }
  if (notificaciones.length > 0) {
    console.log('')
    console.log(`Notificaciones (${notificaciones.length}):`)
    notificaciones.forEach(printRule)
  }
  if (otras.length > 0) {
    console.log('')
    console.log(`Otras validaciones (${otras.length}):`)
    otras.forEach(printRule)
  }

  console.log('')
  console.log('Respuesta cruda:')
  console.log(JSON.stringify(data ?? {}, null, 2))

  return approved
}

function printLocalIssues(issues) {
  console.log('')
  console.log('El JSON RIPS no cumple la validación local previa al MUV:')
  for (const issue of issues) {
    console.log(`  [${issue.level}] ${issue.field ?? 'rips'}: ${issue.message}`)
  }
}

async function buildRequestBody(settings, rips) {
  if (!settings.xmlPath) {
    return { rips, xmlFevFile: '' }
  }
  const xml = await readFile(settings.xmlPath)
  return { rips, xmlFevFile: xml.toString('base64') }
}

async function main() {
  assertMuvCredentials()
  const settings = readSettings()
  const rips = buildMinimalRips(settings)
  const localIssues = validateRipsPackageLocally(rips, {
    perfilFiscal: settings.xmlPath ? 'Obligado_FEV' : 'No_Obligado',
    allowNullNumFactura: !settings.xmlPath,
    codPrestador: settings.codPrestador,
  })

  console.log('MUV — prueba de comunicación')
  console.log(`Destino: ${settings.sandbox ? 'Stage (pruebas)' : 'Producción'}`)
  console.log(`Login: ${settings.loginUrl}`)
  console.log(`Carga: ${settings.cargarUrl}`)
  console.log(`NIT: ${settings.nit || '(no configurado)'}`)
  console.log(`numFactura: ${rips.numFactura ?? 'null'}  tipoNota: ${rips.tipoNota ?? 'null'}  numNota: ${rips.numNota ?? 'null'}`)

  if (hasBlockingValidationErrors(localIssues)) {
    printLocalIssues(localIssues)
    process.exitCode = 1
    return
  }
  const warnings = localIssues.filter((issue) => issue.level === 'warning')
  if (warnings.length > 0) {
    console.log('')
    console.log('Advertencias locales:')
    for (const issue of warnings) {
      console.log(`  [warning] ${issue.field ?? 'rips'}: ${issue.message}`)
    }
  } else {
    console.log('Validación local del RIPS: sin errores.')
  }

  console.log('')
  console.log('Autenticando en LoginSISPRO…')
  let auth
  try {
    auth = await authenticate(settings)
  } catch (error) {
    console.log('')
    console.log(`No hubo respuesta de autenticación: ${error.message}`)
    process.exitCode = 2
    return
  }

  if (!auth.accepted) {
    console.log('')
    console.log(`Autenticación rechazada (HTTP ${auth.response.status}).`)
    if (auth.errors.length > 0) {
      for (const message of auth.errors) console.log(`  - ${message}`)
    } else {
      console.log(JSON.stringify(auth.data ?? {}, null, 2))
    }
    process.exitCode = 2
    return
  }

  console.log(`Token recibido (${auth.token.length} caracteres). Enviando RIPS…`)
  const payload = await buildRequestBody(settings, rips)

  let carga
  try {
    carga = await requestJson(settings.cargarUrl, {
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${auth.token}`,
      },
      body: payload,
    })
  } catch (error) {
    console.log('')
    console.log(`No hubo respuesta del MUV: ${error.message}`)
    process.exitCode = 1
    return
  }

  const approved = printMuvResponse({ httpStatus: carga.response.status, data: carga.data })
  process.exitCode = approved ? 0 : 1
}

const invokedDirectly =
  Boolean(process.argv[1]) && pathToFileURL(process.argv[1]).href === import.meta.url

if (invokedDirectly) {
  main().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
