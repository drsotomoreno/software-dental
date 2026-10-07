/**
 * Cierra una consulta sin factura: genera el RIPS, lo radica en el MUV
 * y deja el CUV y el estado en la tabla consultas.
 */
import { FevRipsService, readFevRipsSettings } from './fevRipsService.js'
import { RipsMapper, RipsMapperError } from './ripsMapper.js'
import {
  ensureConsultasSchema,
  guardarResultadoMuv,
  obtenerConsulta,
} from './consultasRepository.js'

export { RipsMapperError }

const CUV_PATTERN = /^[a-f0-9]{96}$/i

export function consultaIdDe(atencion, metadatos = {}) {
  const fromList = Array.isArray(metadatos.clinicalRecordIds) ? metadatos.clinicalRecordIds[0] : null
  const raw = atencion?.id ?? atencion?.clinicalRecordId ?? metadatos.clinicalRecordId ?? fromList
  const id = String(raw ?? '').trim()
  return id || null
}

/**
 * APROBADO solo con ResultState verdadero y un CUV de 96 hex.
 * Las notificaciones no cambian el estado si el ministerio entregó CUV.
 * @param {number} httpStatus
 * @param {object | null} data
 */
export function interpretarRespuestaMuv(httpStatus, data) {
  const body = data && typeof data === 'object' ? data : {}
  const cuv = String(body.CodigoUnicoValidacion ?? body.codigoUnicoValidacion ?? body.cuv ?? '').trim()
  const aprobado = body.ResultState === true && CUV_PATTERN.test(cuv)
  return {
    estadoMuv: aprobado ? 'APROBADO' : 'RECHAZADO',
    cuv: cuv || null,
    resultadoValidacion: {
      httpStatus: httpStatus ?? null,
      ResultState: body.ResultState === true,
      ProcesoId: body.ProcesoId ?? body.procesoId ?? null,
      FechaRadicacion: body.FechaRadicacion ?? body.fechaRadicacion ?? null,
      Ambiente: body.Ambiente ?? null,
      ResultadosValidacion: Array.isArray(body.ResultadosValidacion) ? body.ResultadosValidacion : [],
      errors: body.errors ?? body.Errors ?? null,
    },
  }
}

export function prestadorDesdeSesion(user = {}) {
  const settings = readFevRipsSettings()
  return {
    nit: user.providerNit || user.nit || settings.nit,
    codPrestador: user.repsCode || user.codPrestador || settings.codPrestador,
    tipoDocumento: user.documentType || settings.tipoDocumento,
    numeroDocumento: user.documentNumber || settings.numeroDocumento,
  }
}

function identidadDe(id, atencion, metadatos, user) {
  return {
    id,
    clinicId: metadatos.clinicId || user?.clinicId || user?.id || null,
    patientId: metadatos.patientId || metadatos.patientUuid || atencion?.patientId || atencion?.patient?.id || null,
    professionalId: metadatos.professionalId || user?.id || atencion?.professionalId || null,
    clinicalRecordId: String(
      (Array.isArray(metadatos.clinicalRecordIds) ? metadatos.clinicalRecordIds[0] : null) ||
        metadatos.clinicalRecordId ||
        atencion?.id ||
        id,
    ),
  }
}

function errorDeBase(message, payload, cause) {
  const error = new Error(message)
  error.statusCode = 503
  error.cuv = payload.cuv ?? null
  error.estadoMuv = payload.estadoMuv
  error.resultadoValidacion = payload.resultadoValidacion ?? null
  error.cause = cause
  return error
}

/**
 * @param {{ atencion: object, prestador?: object, metadatos?: object, user?: object }} input
 * @param {object} [deps] Repositorio y cliente MUV inyectables en pruebas.
 */
export async function finalizarConsultaEnMuv(input, deps = {}) {
  const atencion = input?.atencion
  const metadatos = input?.metadatos ?? {}
  const user = input?.user
  const id = consultaIdDe(atencion, metadatos)
  if (!id) {
    const error = new Error('La consulta no tiene id para guardar el CUV.')
    error.statusCode = 400
    throw error
  }

  const repo = {
    ensureConsultasSchema: deps.ensureConsultasSchema ?? ensureConsultasSchema,
    obtenerConsulta: deps.obtenerConsulta ?? obtenerConsulta,
    guardarResultadoMuv: deps.guardarResultadoMuv ?? guardarResultadoMuv,
  }

  try {
    await repo.ensureConsultasSchema()
  } catch (cause) {
    throw errorDeBase('No se pudo preparar la tabla de consultas.', { estadoMuv: 'PENDIENTE' }, cause)
  }

  const identidad = identidadDe(id, atencion, metadatos, user)
  let existente = null
  try {
    existente = await repo.obtenerConsulta(id)
  } catch (cause) {
    throw errorDeBase('No se pudo leer la consulta en la base de datos.', { estadoMuv: 'PENDIENTE' }, cause)
  }

  if (existente?.estadoMuv === 'APROBADO' && existente.cuv) {
    return {
      alreadyStored: true,
      consulta: existente,
      rips: null,
      estadoMuv: 'APROBADO',
      cuv: existente.cuv,
      resultadoValidacion: existente.resultadoValidacion,
    }
  }

  const persistir = async (payload) => {
    try {
      return await repo.guardarResultadoMuv({ ...identidad, ...payload })
    } catch (cause) {
      throw errorDeBase('No se pudo guardar el CUV en la base de datos.', payload, cause)
    }
  }

  await persistir({
    cuv: null,
    estadoMuv: 'PENDIENTE',
    resultadoValidacion: { fase: 'pendiente_envio' },
  })

  const mapper = deps.mapper ?? new RipsMapper(input.prestador ?? prestadorDesdeSesion(user))
  let rips
  try {
    rips = mapper.toRipsSinFactura(atencion)
  } catch (error) {
    const consulta = await persistir({
      cuv: null,
      estadoMuv: 'RECHAZADO',
      resultadoValidacion: {
        fase: 'generacion_rips',
        error: error instanceof Error ? error.message : String(error),
        field: error?.field ?? null,
      },
    })
    if (error && typeof error === 'object') error.consulta = consulta
    throw error
  }

  const service = deps.fevRipsService ?? new FevRipsService()
  let envio
  try {
    envio = await service.enviarRipsSinFactura(rips)
  } catch (error) {
    const consulta = await persistir({
      cuv: null,
      estadoMuv: 'RECHAZADO',
      resultadoValidacion: {
        fase: 'autenticacion_muv',
        error: error instanceof Error ? error.message : String(error),
        errors: error?.errors ?? null,
        status: error?.status ?? null,
      },
    })
    const wrapped = new Error(error instanceof Error ? error.message : 'No se pudo contactar el MUV.')
    wrapped.statusCode = 502
    wrapped.consulta = consulta
    wrapped.estadoMuv = 'RECHAZADO'
    throw wrapped
  }

  const interpreted = interpretarRespuestaMuv(envio.httpStatus, envio.data)
  const consulta = await persistir({
    cuv: interpreted.cuv,
    estadoMuv: interpreted.estadoMuv,
    resultadoValidacion: interpreted.resultadoValidacion,
  })

  return {
    alreadyStored: false,
    consulta,
    rips,
    estadoMuv: interpreted.estadoMuv,
    cuv: interpreted.estadoMuv === 'APROBADO' ? interpreted.cuv : null,
    resultadoValidacion: interpreted.resultadoValidacion,
  }
}
