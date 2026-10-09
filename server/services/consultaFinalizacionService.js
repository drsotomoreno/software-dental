/**
 * Después de insertar la consulta, genera el RIPS y lo radica.
 * Un RipsMapperError o un rechazo del MUV hacen UPDATE de estado_muv
 * y no deshacen ese guardado ni tumban la petición.
 */
import { readFevRipsSettings } from './fevRipsService.js'
import { MinsaludService } from './minsaludService.js'
import { RipsMapper, RipsMapperError } from './ripsMapper.js'
import {
  actualizarEstadoMuv,
  ensureConsultasSchema,
  insertarConsultaClinica,
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
 * APROBADO cuando el MUV responde ResultState verdadero y entrega CUV.
 * El arreglo de validaciones se guarda tal cual.
 * @param {object | null} envio
 */
export function aplicarRespuestaEstandar(envio) {
  const resultState = envio?.resultState === true || envio?.ResultState === true
  const crudo = envio?.CUV ?? envio?.cuv ?? envio?.CodigoUnicoValidacion ?? ''
  const cuv = String(crudo ?? '').trim()
  const resultados = Array.isArray(envio?.resultadosValidacion)
    ? envio.resultadosValidacion
    : Array.isArray(envio?.ResultadosValidacion)
      ? envio.ResultadosValidacion
      : []
  if (resultState && cuv && cuv !== '-') {
    return { estadoMuv: 'APROBADO', cuv, resultadoValidacion: resultados }
  }
  return { estadoMuv: 'RECHAZADO', cuv: null, resultadoValidacion: resultados }
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
  error.detalle = cause instanceof Error ? cause.message : cause ? String(cause) : null
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
    insertarConsultaClinica: deps.insertarConsultaClinica ?? insertarConsultaClinica,
    actualizarEstadoMuv: deps.actualizarEstadoMuv ?? actualizarEstadoMuv,
  }

  try {
    await repo.ensureConsultasSchema()
  } catch (cause) {
    console.error('[consultas] No se pudo preparar la tabla de consultas.', cause)
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

  let guardada
  try {
    guardada = await repo.insertarConsultaClinica(identidad)
  } catch (cause) {
    throw errorDeBase('No se pudo guardar la consulta en la base de datos.', { estadoMuv: 'PENDIENTE' }, cause)
  }

  const actualizar = async (payload) => {
    try {
      return await repo.actualizarEstadoMuv({ id: guardada.id, ...payload })
    } catch (cause) {
      throw errorDeBase('No se pudo guardar el CUV en la base de datos.', payload, cause)
    }
  }

  const mapper = deps.mapper ?? new RipsMapper(input.prestador ?? prestadorDesdeSesion(user), input.env)
  const atencionGuardada = {
    ...atencion,
    id: guardada.id,
    clinicId: guardada.clinicId,
    patientId: guardada.patientId,
    professionalId: guardada.professionalId,
    clinicalRecordId: guardada.clinicalRecordId,
  }
  let rips
  try {
    rips = mapper.toRipsSinFactura(atencionGuardada)
  } catch (error) {
    const esMapper = error instanceof RipsMapperError || error?.name === 'RipsMapperError'
    if (!esMapper) throw error
    const detalle = {
      error: error.message,
      field: error.field ?? null,
    }
    const consulta = await actualizar({
      cuv: null,
      estadoMuv: 'RECHAZADO',
      resultadoValidacion: detalle,
    })
    return {
      clinicoGuardado: true,
      alreadyStored: false,
      consulta,
      rips: null,
      estadoMuv: 'RECHAZADO',
      cuv: null,
      error: error.message,
      field: error.field ?? null,
      resultadoValidacion: detalle,
    }
  }

  let envio
  try {
    const service = deps.minsaludService ?? deps.fevRipsService ?? new MinsaludService()
    envio = await service.enviarRipsSinFactura(rips)
  } catch (error) {
    const detalle = {
      error: error instanceof Error ? error.message : 'No se pudo contactar el MUV.',
      errors: error?.errors ?? null,
      status: error?.status ?? null,
    }
    const consulta = await actualizar({
      cuv: null,
      estadoMuv: 'RECHAZADO',
      resultadoValidacion: detalle,
    })
    return {
      clinicoGuardado: true,
      alreadyStored: false,
      consulta,
      rips,
      estadoMuv: 'RECHAZADO',
      cuv: null,
      error: detalle.error,
      resultadoValidacion: detalle,
    }
  }

  const interpreted = aplicarRespuestaEstandar(envio)
  const consulta = await actualizar({
    cuv: interpreted.cuv,
    estadoMuv: interpreted.estadoMuv,
    resultadoValidacion: interpreted.resultadoValidacion,
  })

  return {
    clinicoGuardado: true,
    alreadyStored: false,
    consulta,
    rips,
    estadoMuv: interpreted.estadoMuv,
    cuv: interpreted.cuv,
    error: interpreted.estadoMuv === 'APROBADO' ? null : 'El MUV rechazó el RIPS de la consulta.',
    resultadoValidacion: interpreted.resultadoValidacion,
  }
}
