import { randomUUID } from 'node:crypto'
import { alertasDeEstado, clasificarEstadoCuv, etiquetaEstado, sanitizeMinistryPayload } from './estado.js'
import { getCuvStore } from './store.js'
import { submitRipsToMinsalud } from '../minsaludRipsClient.js'

/**
 * @param {unknown} issues
 */
function rechazosLocales(issues) {
  if (!Array.isArray(issues)) return []
  return issues
    .filter((issue) => issue?.level === 'error')
    .map((issue) => ({
      clase: 'RECHAZADO',
      codigo: 'LOCAL',
      descripcion: String(issue.message ?? 'Validación local'),
      observaciones: '',
      pathFuente: String(issue.field ?? ''),
      fuente: 'LOCAL',
    }))
}

/**
 * @param {object} entry
 */
function reglasDe(entry) {
  const notificaciones = Array.isArray(entry.notificaciones) ? entry.notificaciones : []
  const desdeMinisterio = Array.isArray(entry.rechazos) && entry.rechazos.length > 0
    ? entry.rechazos
    : (entry.ministryErrors ?? [])
  return {
    notificaciones,
    rechazos: [...desdeMinisterio, ...rechazosLocales(entry.localIssues)],
  }
}

/**
 * @param {object} expediente
 * @param {object[]} intentos
 */
export function expedientePublico(expediente, intentos) {
  const ultimo = intentos[intentos.length - 1]
  const notificaciones = ultimo?.notificaciones ?? []
  const rechazos = ultimo?.rechazos ?? []
  return {
    id: expediente.id,
    createdAt: expediente.createdAt,
    updatedAt: expediente.updatedAt,
    cuv: expediente.cuv ?? null,
    numFactura: expediente.numFactura ?? null,
    numDocumentoIdObligado: expediente.numDocumentoIdObligado ?? '',
    status: expediente.estado === 'rechazado' ? 'rejected' : 'approved',
    estado: expediente.estado,
    estadoEtiqueta: etiquetaEstado(expediente.estado),
    procesoId: expediente.procesoId ?? null,
    fechaRadicacion: expediente.fechaRadicacion ?? null,
    ambiente: expediente.ambiente ?? null,
    modulo: expediente.modulo ?? null,
    source: expediente.source ?? null,
    invoiceId: expediente.invoiceId ?? null,
    clinicalRecordId: expediente.clinicalRecordId ?? null,
    patientId: expediente.patientId ?? null,
    patientUuid: expediente.patientId ?? null,
    clinicalRecordIds: expediente.clinicalRecordId ? [expediente.clinicalRecordId] : [],
    puedeReenviar: Boolean(expediente.tienePaquete || expediente.paquete),
    alertas: alertasDeEstado({ estado: expediente.estado, notificaciones, rechazos }),
    intentos: intentos.map((intento) => ({
      id: intento.id,
      numero: intento.numero,
      estado: intento.estado,
      estadoEtiqueta: etiquetaEstado(intento.estado),
      httpStatus: intento.httpStatus ?? null,
      cuv: intento.cuv ?? null,
      notificaciones: intento.notificaciones ?? [],
      rechazos: intento.rechazos ?? [],
      respuestaCruda: intento.respuestaCruda ?? null,
      source: intento.source ?? null,
      startedAt: intento.startedAt,
      finishedAt: intento.finishedAt ?? null,
    })),
  }
}

/**
 * @param {object} entry
 * @param {object} [store]
 */
export async function registrarRadicacion(entry, store) {
  const persistence = store ?? await getCuvStore()
  const reglas = reglasDe(entry)
  const estado = clasificarEstadoCuv({
    cuv: entry.cuv,
    notificaciones: reglas.notificaciones,
    rechazos: reglas.rechazos,
  })
  const now = new Date().toISOString()
  const existing = await persistence.findMatch({
    id: entry.id,
    invoiceId: entry.invoiceId ?? entry.metadatos?.invoiceId,
    numFactura: entry.numFactura ?? entry.rips?.numFactura,
    numDocumentoIdObligado: entry.numDocumentoIdObligado ?? entry.rips?.numDocumentoIdObligado,
    cuv: entry.cuv,
  })
  const id = existing?.id ?? randomUUID()
  const paquete = entry.rips
    ? {
        rips: entry.rips,
        xmlFev: entry.xmlFev ?? entry.metadatos?.xmlFev ?? null,
        xmlFevFile: entry.xmlFevFile ?? entry.metadatos?.xmlFevFile ?? null,
        metadatos: entry.metadatos ?? {},
      }
    : existing?.paquete ?? null
  const expediente = {
    id,
    invoiceId: entry.invoiceId ?? entry.metadatos?.invoiceId ?? existing?.invoiceId ?? null,
    clinicalRecordId: entry.clinicalRecordId
      ?? entry.metadatos?.clinicalRecordIds?.[0]
      ?? existing?.clinicalRecordId
      ?? null,
    patientId: entry.patientId ?? entry.patientUuid ?? entry.metadatos?.patientUuid ?? existing?.patientId ?? null,
    numFactura: entry.numFactura ?? entry.rips?.numFactura ?? existing?.numFactura ?? null,
    numDocumentoIdObligado: entry.numDocumentoIdObligado
      ?? entry.rips?.numDocumentoIdObligado
      ?? existing?.numDocumentoIdObligado
      ?? '',
    cuv: estado === 'rechazado' ? (entry.cuv ?? null) : entry.cuv,
    estado,
    procesoId: entry.procesoId ?? existing?.procesoId ?? null,
    fechaRadicacion: entry.fechaRadicacion ?? existing?.fechaRadicacion ?? null,
    ambiente: entry.ambiente ?? existing?.ambiente ?? null,
    modulo: entry.modulo ?? existing?.modulo ?? null,
    source: entry.source ?? existing?.source ?? null,
    tienePaquete: Boolean(paquete),
    paquete,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  }
  await persistence.save(expediente)
  const previos = await persistence.intentosDe(id)
  const intento = {
    id: randomUUID(),
    expedienteId: id,
    numero: previos.length + 1,
    estado,
    httpStatus: entry.httpStatus ?? null,
    cuv: entry.cuv ?? null,
    notificaciones: reglas.notificaciones,
    rechazos: reglas.rechazos,
    respuestaCruda: sanitizeMinistryPayload(entry.respuestaCruda ?? null),
    source: entry.source ?? null,
    startedAt: now,
    finishedAt: now,
  }
  await persistence.addIntento(intento)
  return expedientePublico(expediente, [...previos, intento])
}

/**
 * @param {string} id
 * @param {{ store?: object, submit?: Function }} [deps]
 */
export async function reenviarExpediente(id, deps = {}) {
  const persistence = deps.store ?? await getCuvStore()
  const expediente = await persistence.get(id)
  if (!expediente) {
    return { success: false, status: 404, error: 'Expediente CUV no encontrado.' }
  }
  if (!expediente.paquete?.rips) {
    return {
      success: false,
      status: 422,
      error: 'Este expediente no conserva el paquete FEV-RIPS para reenviarlo.',
    }
  }
  const submit = deps.submit ?? submitRipsToMinsalud
  const result = await submit({
    rips: expediente.paquete.rips,
    metadatos: expediente.paquete.metadatos ?? {},
    xmlFev: expediente.paquete.xmlFev,
    xmlFevFile: expediente.paquete.xmlFevFile,
  })
  const saved = await registrarRadicacion({
    id: expediente.id,
    invoiceId: expediente.invoiceId,
    clinicalRecordId: expediente.clinicalRecordId,
    patientId: expediente.patientId,
    numFactura: expediente.numFactura,
    numDocumentoIdObligado: expediente.numDocumentoIdObligado,
    rips: expediente.paquete.rips,
    xmlFev: expediente.paquete.xmlFev,
    xmlFevFile: expediente.paquete.xmlFevFile,
    metadatos: expediente.paquete.metadatos,
    cuv: result.cuv,
    notificaciones: result.notificaciones,
    rechazos: result.rechazos,
    ministryErrors: result.ministryErrors,
    localIssues: result.localIssues,
    respuestaCruda: result.respuestaCruda,
    httpStatus: result.httpStatus,
    procesoId: result.procesoId,
    fechaRadicacion: result.fechaRadicacion,
    ambiente: result.ambiente,
    modulo: result.modulo,
    source: result.source,
  }, persistence)
  return {
    success: saved.estado !== 'rechazado',
    status: saved.estado === 'rechazado' ? 422 : 200,
    expediente: saved,
  }
}

/**
 * @param {{ id?: string, cuv?: string, numFactura?: string, numDocumentoIdObligado?: string }} query
 * @param {object} [store]
 */
export async function consultarEstadoCuv(query, store) {
  const persistence = store ?? await getCuvStore()
  const expediente = await persistence.findMatch(query)
  if (!expediente) {
    return { success: false, status: 404, error: 'No hay una validación registrada para ese CUV.' }
  }
  const intentos = await persistence.intentosDe(expediente.id)
  return { success: true, status: 200, expediente: expedientePublico(expediente, intentos) }
}

/**
 * @param {{ estado?: string, limit?: number }} [query]
 * @param {object} [store]
 */
export async function listarExpedientes(query = {}, store) {
  const persistence = store ?? await getCuvStore()
  const limit = Number(query.limit ?? 100)
  let rows = await persistence.list()
  if (query.estado) rows = rows.filter((item) => item.estado === query.estado)
  rows = rows.slice(0, Number.isFinite(limit) ? limit : 100)
  const publicos = []
  for (const row of rows) {
    const intentos = await persistence.intentosDe(row.id)
    const view = expedientePublico(row, intentos)
    view.intentos = view.intentos.map((intento) => ({ ...intento, respuestaCruda: undefined }))
    publicos.push(view)
  }
  return publicos
}
