/**
 * Lectura individual de la ficha. No serializa el cubo de la clínica.
 * GET /api/patients/:idOrSyncId/chart
 */
import { Router } from 'express'
import {
  resolveSubscriptionSession,
  sessionHintFromRequest,
} from '../services/subscriptionAuthStore.js'
import { clinicKeyInScope, clinicSyncAliasIds } from '../../shared/clinicalSyncScope.js'
import { readOrMigratePatientChart } from '../services/clinicalPostgresStore.js'
import { heapPressurePayload, isHeapNearLimit } from '../utils/heapPressure.js'
import { sendJsonStream } from '../utils/jsonStream.js'

const router = Router()

function sendJson(res, status, body) {
  if (res.headersSent || res.writableEnded) return
  return res.status(status).json(body)
}

function bearerToken(req) {
  const authHeader = req.headers.authorization ?? ''
  return authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null
}

function tenantIdFromRequest(req) {
  const query = req.query && typeof req.query === 'object' ? req.query : {}
  return String(query.tenant_id || query.clinicId || '').trim()
}

async function requireClinicSession(req, res) {
  const session = await resolveSubscriptionSession(bearerToken(req), sessionHintFromRequest(req))
  if (!session?.user) {
    sendJson(res, 401, { success: false, ok: false, error: 'Sesión inválida o expirada.' })
    return null
  }
  const scope = clinicSyncAliasIds(session.user)
  if (!scope.canonical) {
    sendJson(res, 400, { success: false, ok: false, error: 'La sesión no tiene clínica asociada.' })
    return null
  }
  const requested = tenantIdFromRequest(req)
  if (requested && !clinicKeyInScope(requested, scope.canonical, scope.aliases)) {
    sendJson(res, 403, {
      success: false,
      ok: false,
      error: 'Violación de seguridad. No tienes permisos para acceder a los datos de esta sede.',
    })
    return null
  }
  const tier = session.accessTier
  if (tier !== 'full' && tier !== 'trial') {
    sendJson(res, 402, {
      success: false,
      ok: false,
      error: 'Sin suscripción pagada no puede consultar historias clínicas.',
      requiresSubscription: true,
    })
    return null
  }
  return { session, ...scope }
}

router.get('/:idOrSyncId/chart', async (req, res) => {
  try {
    const auth = await requireClinicSession(req, res)
    if (!auth) return
    if (isHeapNearLimit(0.68)) {
      sendJson(res, 503, heapPressurePayload(25))
      return
    }
    const routeId = String(req.params?.idOrSyncId || '').trim()
    const query = req.query && typeof req.query === 'object' ? req.query : {}
    const patientSyncId = String(query.patientSyncId || '').trim()
    const localId = String(query.localId || '').trim()
    const documentNumber = String(query.documentNumber || '').trim()
    if (!routeId && !patientSyncId && !localId && !documentNumber) {
      sendJson(res, 400, { success: false, ok: false, error: 'Falta el identificador del paciente.' })
      return
    }
    const chart = await readOrMigratePatientChart({
      clinicaId: auth.canonical,
      aliasIds: auth.aliases,
      routeId,
      patientSyncId: patientSyncId || routeId,
      localId,
      documentNumber,
      updatedBy: String(auth.session?.user?.email || '').trim(),
    })
    if (!chart) {
      sendJson(res, 404, {
        success: false,
        ok: false,
        error: 'No hay historia clínica para este paciente.',
      })
      return
    }
    sendJsonStream(res, 200, {
      success: true,
      ok: true,
      clinicId: auth.canonical,
      ...chart,
    })
  } catch (error) {
    console.error('[Chart] Error en GET /api/patients/:id/chart:', error)
    const code = error?.code || ''
    const oom =
      code === 'CLINICAL_SYNC_TOO_LARGE' ||
      code === 'HEAP_PRESSURE' ||
      /heap|out of memory|ENOMEM/i.test(error instanceof Error ? error.message : String(error))
    sendJson(res, oom ? 503 : 500, {
      success: false,
      ok: false,
      error: oom
        ? 'El servidor agotó memoria al leer la ficha. Reintente en unos segundos.'
        : 'No se pudo leer la ficha del paciente.',
      code: oom ? code || 'HEAP_PRESSURE' : undefined,
    })
  }
})

export default router
