/**
 * POST /api/rips/send-single y /api/rips/send-batch.
 * La sesión de la app autoriza al prestador. El bearer de SISPRO se resuelve en el servidor.
 */
import { randomUUID } from 'node:crypto'
import { resolveSubscriptionSession, sessionHintFromRequest } from '../services/subscriptionAuthStore.js'
import { MuvInfrastructureError } from '../services/sisproMuvService.js'
import { encolarTransmision, transmitirLote, transmitirRips } from '../services/ripsTransmissionService.js'
import { ripsBatchTracker } from '../services/ripsBatchTracker.js'

const MAX_BATCH = 200

function bearerToken(req) {
  const authHeader = req.headers?.authorization ?? ''
  return authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null
}

function esObjeto(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function pareceRips(value) {
  if (!esObjeto(value)) return false
  return Array.isArray(value.usuarios) || value.numDocumentoIdObligado != null || Object.prototype.hasOwnProperty.call(value, 'numFactura')
}

function textoCorto(value) {
  const text = String(value ?? '').trim()
  return text ? text.slice(0, 200) : null
}

/**
 * Acepta el JSON RIPS crudo o un sobre { rips, cufe, xmlFevFile, evolutionId, patientId }.
 * @returns {object | null}
 */
export function normalizarSobre(body) {
  if (!esObjeto(body)) return null
  const envuelto = esObjeto(body.rips)
  const rips = envuelto ? body.rips : body
  if (!pareceRips(rips)) return null
  return {
    rips,
    cufe: body.cufe ?? body.CUFE ?? rips.cufe ?? rips.CUFE ?? '',
    xmlFevFile: body.xmlFevFile ?? rips.xmlFevFile ?? '',
    evolutionId: textoCorto(body.evolutionId ?? rips.evolutionId),
    patientId: textoCorto(body.patientId ?? rips.patientId),
  }
}

/**
 * @returns {{ sobres: object[] } | { error: string }}
 */
export function normalizarLote(body) {
  let raw = null
  if (Array.isArray(body)) raw = body
  else if (esObjeto(body) && Array.isArray(body.items)) raw = body.items
  else if (esObjeto(body) && Array.isArray(body.rips)) raw = body.rips

  if (!raw) return { error: 'El cuerpo debe ser un array de RIPS o { items: [...] }.' }
  if (raw.length === 0) return { error: 'El lote no trae RIPS.' }
  if (raw.length > MAX_BATCH) return { error: `El lote admite hasta ${MAX_BATCH} RIPS.` }

  const sobres = []
  for (let index = 0; index < raw.length; index += 1) {
    const sobre = normalizarSobre(raw[index])
    if (!sobre) return { error: `El elemento ${index + 1} del lote no es un RIPS.` }
    sobres.push(sobre)
  }
  return { sobres }
}

export function titularDelPrestador(user) {
  return String(user?.id || user?.email || '')
}

function itemDesdeResultado(sobre, result) {
  const errors = Array.isArray(result?.errors) ? result.errors : []
  const cuv = String(result?.cuv ?? '').trim()
  const success = result?.success === true && Boolean(cuv)
  return {
    evolutionId: sobre.evolutionId ?? null,
    patientId: sobre.patientId ?? null,
    success,
    cuv: success ? cuv : null,
    retryable: result?.retryable === true,
    errors: success ? [] : errors,
  }
}

function itemDesdeFallo(sobre, error) {
  return {
    evolutionId: sobre.evolutionId ?? null,
    patientId: sobre.patientId ?? null,
    success: false,
    cuv: null,
    retryable: true,
    errors: [
      {
        code: error?.code || 'MUV_INFRASTRUCTURE',
        message: error instanceof Error ? error.message : 'No se pudo contactar el MUV.',
        path: '',
      },
    ],
  }
}

function vigilarLote(tracker, batchId, enviar) {
  return async (sobre, context, deps) => {
    try {
      const result = await enviar(sobre, context, deps)
      const item = itemDesdeResultado(sobre, result)
      tracker.anotar(batchId, item)
      return result
    } catch (error) {
      const item = itemDesdeFallo(sobre, error)
      tracker.anotar(batchId, item)
      return { success: false, cuv: null, errors: item.errors, retryable: true }
    }
  }
}

function esInfraestructura(error) {
  return error instanceof MuvInfrastructureError || error?.name === 'MuvInfrastructureError' || error?.retryable === true
}

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export async function sendSingleRips(req, res, deps = {}) {
  const resolveSession = deps.resolveSession ?? resolveSubscriptionSession
  const transmitir = deps.transmitir ?? transmitirRips
  try {
    const session = await resolveSession(bearerToken(req), sessionHintFromRequest(req))
    if (!session?.user) {
      return res.status(401).json({ success: false, error: 'Sesión inválida o expirada.' })
    }
    if (Array.isArray(req.body)) {
      return res.status(400).json({
        success: false,
        error: 'send-single recibe un objeto RIPS. Para varios use /api/rips/send-batch.',
      })
    }

    const envelope = normalizarSobre(req.body)
    if (!envelope) {
      return res.status(400).json({ success: false, error: 'El cuerpo debe incluir un JSON RIPS.' })
    }

    console.info('[rips/send-single] inicio', {
      evolutionId: envelope.evolutionId,
      userId: session.user.id ?? null,
      fev: Boolean(String(envelope.cufe ?? '').trim() || String(envelope.xmlFevFile ?? '').trim()),
    })

    const result = await transmitir(envelope, { user: session.user, modo: 'single' })
    if (result.success) {
      return res.status(200).json({
        success: true,
        cuv: result.cuv,
        logId: result.logId ?? null,
        auditStored: result.auditStored !== false,
        canal: result.canal,
      })
    }
    return res.status(422).json({
      success: false,
      errors: result.errors ?? [],
      logId: result.logId ?? null,
      auditStored: result.auditStored !== false,
      canal: result.canal,
    })
  } catch (error) {
    if (esInfraestructura(error)) {
      const status = error.status === 504 ? 504 : 503
      console.error('[rips/send-single] reintento pendiente', { code: error.code, message: error.message })
      return res.status(status).json({
        success: false,
        retryable: true,
        code: error.code || 'MUV_INFRASTRUCTURE',
        error: error.message,
        logId: error.logId ?? null,
      })
    }
    console.error('[rips/send-single]', error instanceof Error ? error.message : error)
    return res.status(500).json({ success: false, error: 'No se pudo enviar el RIPS.' })
  }
}

/**
 * Acepta el lote y lo radica en serie después de responder.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export async function sendBatchRips(req, res, deps = {}) {
  const resolveSession = deps.resolveSession ?? resolveSubscriptionSession
  const lote = deps.transmitirLote ?? transmitirLote
  try {
    const session = await resolveSession(bearerToken(req), sessionHintFromRequest(req))
    if (!session?.user) {
      return res.status(401).json({ success: false, error: 'Sesión inválida o expirada.' })
    }

    const parsed = normalizarLote(req.body)
    if (parsed.error) return res.status(400).json({ success: false, error: parsed.error })

    const batchId = randomUUID()
    const context = { user: session.user, modo: 'batch', batchId }
    const tracker = deps.tracker ?? ripsBatchTracker
    const enviar = deps.transmitir ?? transmitirRips
    tracker.abrir(batchId, parsed.sobres, titularDelPrestador(session.user))
    console.info('[rips/send-batch] lote aceptado', {
      batchId,
      count: parsed.sobres.length,
      userId: session.user.id ?? null,
    })

    res.status(202).json({
      success: true,
      accepted: true,
      batchId,
      count: parsed.sobres.length,
    })

    const encolar =
      deps.encolar ??
      ((tarea) => {
        setImmediate(() => {
          encolarTransmision(tarea).catch((error) => {
            console.error('[rips/send-batch] cola', error instanceof Error ? error.message : error)
          })
        })
      })
    encolar(() =>
      lote(parsed.sobres, context, { ...deps, transmitir: vigilarLote(tracker, batchId, enviar) })
        .catch((error) => {
          tracker.cerrar(batchId, error instanceof Error ? error.message : 'No se pudo procesar el lote.')
          throw error
        })
        .finally(() => tracker.cerrar(batchId)),
    )
    return undefined
  } catch (error) {
    console.error('[rips/send-batch]', error instanceof Error ? error.message : error)
    if (res.headersSent) return undefined
    return res.status(500).json({ success: false, error: 'No se pudo aceptar el lote RIPS.' })
  }
}

/**
 * GET /api/rips/send-batch/:batchId
 * Resultado por atención cuando el lote diario termina.
 */
export async function getBatchRips(req, res, deps = {}) {
  const resolveSession = deps.resolveSession ?? resolveSubscriptionSession
  try {
    const session = await resolveSession(bearerToken(req), sessionHintFromRequest(req))
    if (!session?.user) {
      return res.status(401).json({ success: false, error: 'Sesión inválida o expirada.' })
    }
    const tracker = deps.tracker ?? ripsBatchTracker
    const batch = tracker.obtener(req.params.batchId, titularDelPrestador(session.user))
    if (!batch) return res.status(404).json({ success: false, error: 'Lote RIPS no encontrado.' })
    return res.status(200).json({ success: true, ...batch })
  } catch (error) {
    console.error('[rips/send-batch] consulta', error instanceof Error ? error.message : error)
    return res.status(500).json({ success: false, error: 'No se pudo consultar el lote RIPS.' })
  }
}
