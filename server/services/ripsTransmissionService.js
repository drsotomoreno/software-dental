/**
 * Orquesta la radicación MUV, la auditoría en rips_logs y el estado en atenciones.
 * Un CUV ya otorgado se devuelve aunque falle el insert de auditoría.
 * Un timeout no marca la atención como error: queda disponible para reintentar.
 */
import { config } from '../config.js'
import { normalizeRipsNumFactura } from '../../shared/fiscalProfile.js'
import { submitRipsToMinsalud } from './minsaludRipsClient.js'
import { MuvInfrastructureError, SisproMuvService, canalDeEnvio } from './sisproMuvService.js'
import { actualizarAtencionRips, registrarRipsLog } from './ripsLogRepository.js'

const XML_OMIT_CHARS = 32_000

let servicioCompartido = null
let cadena = Promise.resolve()

export function servicioMuvCompartido() {
  if (!servicioCompartido) servicioCompartido = new SisproMuvService()
  return servicioCompartido
}

/** Los lotes diarios se procesan uno después de otro para no saturar el MUV. */
export function encolarTransmision(tarea) {
  const ejecucion = cadena.then(() => tarea(), () => tarea())
  cadena = ejecucion.then(
    () => undefined,
    () => undefined,
  )
  return ejecucion
}

export function usuarioPrestadorDeSesion(user = {}) {
  const nit = user.providerNit || user.nit || null
  return {
    id: user.id != null ? String(user.id) : null,
    email: user.email ? String(user.email) : null,
    documentNumber: user.documentNumber ? String(user.documentNumber) : null,
    nit: nit ? String(nit) : null,
    nombre: user.nombre || user.name || null,
  }
}

function textoXml(value) {
  if (typeof value !== 'string' || !value) return value || null
  if (value.length <= XML_OMIT_CHARS) return value
  return { omitted: true, bytes: Buffer.byteLength(value) }
}

/** Copia de la solicitud para RDS. El XML FEV grande queda solo con su tamaño. */
export function payloadParaAuditoria(envelope = {}) {
  const rips =
    envelope.rips && typeof envelope.rips === 'object' && !Array.isArray(envelope.rips) ? { ...envelope.rips } : {}
  if (typeof rips.xmlFevFile === 'string') rips.xmlFevFile = textoXml(rips.xmlFevFile)
  return {
    rips,
    cufe: String(envelope.cufe ?? envelope.rips?.cufe ?? envelope.rips?.CUFE ?? '').trim() || null,
    xmlFevFile: textoXml(typeof envelope.xmlFevFile === 'string' ? envelope.xmlFevFile : '') || null,
    evolutionId: envelope.evolutionId ?? null,
    patientId: envelope.patientId ?? null,
  }
}

export function textoErrorRips(errors) {
  const text = (Array.isArray(errors) ? errors : [])
    .map((item) => [item?.code, item?.message, item?.path].filter(Boolean).join(' '))
    .filter(Boolean)
    .join(' | ')
  return text.slice(0, 4_000) || null
}

function respuestaAuditable(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return data ?? null
  const copia = { ...data }
  for (const key of ['token', 'Token', 'access_token', 'JWTToken', 'clave', 'password']) delete copia[key]
  return copia
}

function asInfrastructure(error) {
  if (error instanceof MuvInfrastructureError || error?.name === 'MuvInfrastructureError') return error
  if (error?.retryable && error?.code) return error
  return new MuvInfrastructureError(error instanceof Error ? error.message : 'No se pudo contactar el MUV.', {
    code: 'MUV_INFRASTRUCTURE',
    status: 503,
    cause: error,
  })
}

function erroresDeInfra(error) {
  if (Array.isArray(error?.errors) && error.errors.length > 0) return error.errors
  return [{ code: error?.code || 'MUV_INFRASTRUCTURE', message: error?.message || 'No se pudo contactar el MUV.', path: '', clase: 'INFRA' }]
}

function erroresSandbox(simulado) {
  const locales = (simulado.localIssues ?? [])
    .filter((item) => item?.level === 'error')
    .map((item) => ({
      code: 'RIPS_LOCAL',
      message: item.message || 'El paquete no cumple la validación local.',
      path: item.field || '',
      clase: 'ERROR',
    }))
  const ministerio = (simulado.ministryErrors ?? []).map((item) => ({
    code: item.code || 'MUV_VALIDACION',
    message: item.message || 'El sandbox rechazó el campo.',
    path: item.field || '',
    clase: 'ERROR',
  }))
  const errors = [...locales, ...ministerio]
  if (errors.length > 0) return errors
  return [{ code: 'MUV_RECHAZO', message: 'El paquete no pasó la validación de sandbox.', path: '', clase: 'ERROR' }]
}

/**
 * En sandbox no se llama al MUV. El CUV es de prueba, el mismo criterio de submitRipsToMinsalud.
 * Un servicio inyectado (pruebas) sigue hablando con el transporte que le pasaron.
 */
async function outcomeSandbox(envelope, canal) {
  const numFactura = normalizeRipsNumFactura(envelope?.rips?.numFactura)
  const simulado = await submitRipsToMinsalud({
    rips: envelope.rips,
    metadatos: {
      esRipsTemporal: numFactura == null,
      allowNullNumFactura: numFactura == null,
    },
  })
  if (!simulado.success) {
    return {
      success: false,
      cuv: null,
      errors: erroresSandbox(simulado),
      httpStatus: 422,
      canal,
      durationMs: 0,
      source: 'sandbox',
      response: { source: 'sandbox', ResultState: false },
    }
  }
  return {
    success: true,
    cuv: simulado.cuv,
    errors: [],
    httpStatus: 200,
    canal,
    durationMs: 0,
    source: 'sandbox',
    response: { source: 'sandbox', ResultState: true, CodigoUnicoValidacion: simulado.cuv },
  }
}

async function guardarLog(entry, registrar) {
  try {
    return await registrar(entry)
  } catch (error) {
    console.error('[rips] auditoría omitida', {
      code: error?.code ?? null,
      message: error instanceof Error ? error.message.slice(0, 300) : String(error),
    })
    return null
  }
}

/**
 * @param {object} envelope
 * @param {{ user?: object, modo?: 'single' | 'batch', batchId?: string | null }} context
 * @param {{ service?: { enviar: Function }, registrar?: Function, actualizarAtencion?: Function }} [deps]
 */
export async function transmitirRips(envelope, context = {}, deps = {}) {
  const user = context.user ?? {}
  const prestador = usuarioPrestadorDeSesion(user)
  const modo = context.modo === 'batch' ? 'batch' : 'single'
  const canalPrevisto = canalDeEnvio(envelope)
  const base = {
    usuarioPrestador: prestador,
    usuarioPrestadorId: prestador.id,
    nitPrestador: prestador.nit,
    evolutionId: envelope.evolutionId ?? null,
    patientId: envelope.patientId ?? null,
    batchId: context.batchId ?? null,
    modo,
    canal: canalPrevisto,
    requestPayload: payloadParaAuditoria(envelope),
  }
  const registrar = deps.registrar ?? registrarRipsLog
  const actualizar = deps.actualizarAtencion ?? actualizarAtencionRips

  let outcome
  try {
    if (config.minsalud.sandbox && deps.service == null) {
      outcome = await outcomeSandbox(envelope, canalPrevisto)
    } else {
      const service = deps.service ?? servicioMuvCompartido()
      outcome = await service.enviar(envelope)
    }
  } catch (error) {
    const infra = asInfrastructure(error)
    const saved = await guardarLog(
      {
        ...base,
        canal: infra.canal || canalPrevisto,
        httpStatus: Number.isInteger(infra.httpStatus) ? infra.httpStatus : null,
        cuv: null,
        success: false,
        responseMuv: respuestaAuditable(infra.response),
        errors: erroresDeInfra(infra),
        durationMs: infra.durationMs ?? null,
      },
      registrar,
    )
    infra.logId = saved?.id ?? null
    throw infra
  }

  const saved = await guardarLog(
    {
      ...base,
      canal: outcome.canal || canalPrevisto,
      httpStatus: outcome.httpStatus ?? null,
      cuv: outcome.cuv ?? null,
      success: outcome.success === true,
      responseMuv: respuestaAuditable(outcome.response),
      errors: outcome.errors ?? [],
      durationMs: outcome.durationMs ?? null,
    },
    registrar,
  )

  let atencionUpdated = false
  if (envelope.evolutionId) {
    try {
      const estado = await actualizar(envelope.evolutionId, {
        estado: outcome.success ? 'enviado_ok' : 'error',
        cuv: outcome.success ? outcome.cuv : null,
        errorLog: outcome.success ? null : textoErrorRips(outcome.errors),
      })
      atencionUpdated = estado?.updated === true
    } catch (error) {
      console.error('[rips] estado de atención sin actualizar', {
        evolutionId: envelope.evolutionId,
        message: error instanceof Error ? error.message.slice(0, 300) : String(error),
      })
    }
  }

  return {
    success: outcome.success === true,
    cuv: outcome.cuv ?? null,
    errors: outcome.errors ?? [],
    httpStatus: outcome.httpStatus ?? null,
    canal: outcome.canal || canalPrevisto,
    source: outcome.source ?? null,
    durationMs: outcome.durationMs ?? null,
    logId: saved?.id ?? null,
    auditStored: Boolean(saved?.id),
    atencionUpdated,
  }
}

/**
 * Procesa el lote en serie. Un ítem rechazado no detiene el resto.
 */
export async function transmitirLote(sobres, context, deps = {}) {
  const transmitir = deps.transmitir ?? transmitirRips
  let ok = 0
  let failed = 0
  for (const sobre of sobres) {
    try {
      const result = await transmitir(sobre, { ...context, modo: 'batch' }, deps)
      if (result.success) ok += 1
      else failed += 1
    } catch (error) {
      failed += 1
      console.error('[rips/send-batch] ítem', {
        batchId: context.batchId ?? null,
        evolutionId: sobre?.evolutionId ?? null,
        code: error?.code ?? null,
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }
  console.info('[rips/send-batch] lote terminado', { batchId: context.batchId ?? null, ok, failed })
  return { ok, failed }
}
