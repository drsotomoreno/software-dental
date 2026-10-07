#!/usr/bin/env node
/**
 * Prueba aislada contra el ambiente Stage del Mecanismo Único de Validación (MUV).
 * La sesión y el envío viven en server/services/fevRipsService.js.
 *
 * Uso: npm run muv:sandbox
 */

import 'dotenv/config'
import { pathToFileURL } from 'node:url'
import { FevRipsService } from '../server/services/fevRipsService.js'
import { RipsMapper } from '../server/services/ripsMapper.js'
import {
  hasBlockingValidationErrors,
  validateRipsPackageLocally,
} from '../server/services/ripsLocalValidator.js'

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

/**
 * RIPS mínimo de una consulta odontológica aprobado por el Stage.
 * @param {import('../server/services/fevRipsService.js').FevRipsService['settings']} settings
 */
export function buildMinimalRips(settings) {
  const mapper = new RipsMapper({
    nit: settings.nit,
    codPrestador: settings.codPrestador,
    tipoDocumento: settings.tipoDocumento,
    numeroDocumento: settings.numeroDocumento,
  })
  return mapper.toRipsSinFactura({
    paciente: {
      documentType: settings.pacienteTipoDocumento || 'CC',
      documentNumber: settings.pacienteDocumento,
      birthDate: '1991-06-25',
      gender: 'F',
      regime: 'particular',
      municipalityCode: '11001',
    },
    signedAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    diagnoses: [{ code: 'K021', type: 'principal', certainty: 'confirmado' }],
    codConsulta: '890203',
    valorPagadoPaciente: 50000,
  })
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

async function main() {
  assertMuvCredentials()
  const service = new FevRipsService()
  const { settings } = service
  const rips = buildMinimalRips(settings)
  const localIssues = validateRipsPackageLocally(rips, {
    perfilFiscal: 'No_Obligado',
    allowNullNumFactura: true,
    codPrestador: settings.codPrestador,
  })

  console.log('MUV — prueba de comunicación')
  console.log(`Destino: ${settings.sandbox ? 'Stage (pruebas)' : 'Producción'}`)
  console.log(`Login: ${settings.loginUrl}`)
  console.log(`Carga: ${settings.cargarSinFacturaUrl}`)
  console.log(`NIT: ${settings.nit || '(no configurado)'}`)
  console.log(`Usuario: ${settings.tipoDocumento} ${settings.numeroDocumento}  tipoUsuario: ${settings.tipoUsuario || '(no enviado)'}`)
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
  console.log('Enviando RIPS sin factura…')
  let carga
  try {
    carga = await service.enviarRipsSinFactura(rips)
  } catch (error) {
    console.log('')
    if (Array.isArray(error.errors) && error.errors.length > 0) {
      console.log(`Autenticación rechazada (HTTP ${error.status ?? 'sin estado'}).`)
      for (const message of error.errors) console.log(`  - ${message}`)
      process.exitCode = 2
      return
    }
    console.log(`No hubo respuesta del MUV: ${error.message}`)
    process.exitCode = 1
    return
  }

  console.log(
    carga.fromCache
      ? 'Token reutilizado desde la caché en memoria.'
      : `Token recibido (${carga.tokenLength} caracteres).`,
  )
  const approved = printMuvResponse({ httpStatus: carga.httpStatus, data: carga.data })
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
