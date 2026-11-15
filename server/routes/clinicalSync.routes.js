import { Router } from 'express'
import {
  resolveSubscriptionSession,
  sessionHintFromRequest,
} from '../services/subscriptionAuthStore.js'
import { clinicKeyInScope, clinicSyncAliasIds } from '../../shared/clinicalSyncScope.js'
import { countDistinctClinicalPatients, TRIAL_MAX_PATIENTS } from '../../shared/clinicalAccess.js'
import {
  findClinicAttachment,
  isGoogleDriveRequiredError,
  pullClinicSnapshot,
  pullPatientDraft,
  pushClinicSnapshot,
  pushClinicalRecords,
} from '../services/clinicalSyncStore.js'
import { heapPressurePayload, isHeapNearLimit } from '../utils/heapPressure.js'

function driveRequiredPayload(error) {
  return {
    success: false,
    ok: false,
    error:
      error instanceof Error
        ? error.message
        : 'Google Drive es obligatorio para sincronizar adjuntos. Conecte el Gmail de la clínica.',
    code: 'google_drive_required',
    requiresGoogleDrive: true,
  }
}

const router = Router()

/** Evita double-send / Connection reset by peer (104) si el socket ya cerró. */
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
  const body = req.body && typeof req.body === 'object' ? req.body : {}
  return String(query.tenant_id || query.clinicId || body.tenant_id || body.clinicId || '').trim()
}

function booleanQuery(value, fallback) {
  if (value == null || value === '') return fallback
  const normalized = String(value).trim().toLowerCase()
  if (['1', 'true', 'yes', 'full'].includes(normalized)) return true
  if (['0', 'false', 'no'].includes(normalized)) return false
  return fallback
}

/** El cliente no elige la sede. Un id ajeno se rechaza; el cubo sale solo de la sesión. */
function denyForeignTenant(auth, req, res) {
  const requested = tenantIdFromRequest(req)
  if (!requested) return false
  if (clinicKeyInScope(requested, auth.canonical, auth.aliases)) return false
  sendJson(res, 403, {
    success: false,
    ok: false,
    error: 'Violación de seguridad. No tienes permisos para acceder a los datos de esta sede.',
  })
  return true
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
  const auth = { session, ...scope }
  if (denyForeignTenant(auth, req, res)) return null
  return auth
}

function denyWithoutClinicalAccess(auth, res) {
  const tier = auth.session.accessTier
  if (tier === 'full' || tier === 'trial') return false
  sendJson(res, 402, {
    success: false,
    ok: false,
    error:
      'Sin suscripción pagada no puede consultar ni guardar historias clínicas. Active la prueba gratuita o adquiera un plan.',
    requiresSubscription: true,
    accessTier: 'none',
  })
  return true
}

function denyTrialOverflow(auth, body, res) {
  if (auth.session.accessTier !== 'trial') return false
  if (countDistinctClinicalPatients(body) <= TRIAL_MAX_PATIENTS) return false
  sendJson(res, 403, {
    success: false,
    ok: false,
    error: 'La prueba gratuita permite un solo paciente. Adquiera un plan para gestionar más historias.',
    accessTier: 'trial',
  })
  return true
}

function capTrialSnapshot(tier, snapshot) {
  if (tier !== 'trial' || !snapshot || !Array.isArray(snapshot.patients) || snapshot.patients.length <= 1) {
    return snapshot
  }
  const patients = snapshot.patients.slice(0, TRIAL_MAX_PATIENTS)
  const allowedId = String(patients[0]?.id ?? '')
  const keep = (row) => {
    const id = row?.patientId ?? row?.patientSyncId ?? row?.patient_id
    return id != null && id !== '' && String(id) === allowedId
  }
  const filter = (list) => (Array.isArray(list) ? list.filter(keep) : list)
  return {
    ...snapshot,
    patients,
    appointments: filter(snapshot.appointments),
    clinicalRecords: filter(snapshot.clinicalRecords),
    odontograms: filter(snapshot.odontograms),
    diagnosticAids: filter(snapshot.diagnosticAids),
    attachments: filter(snapshot.attachments),
    drafts: filter(snapshot.drafts),
  }
}

function snapshotResponse(auth, snapshot) {
  return {
    success: true,
    ok: true,
    clinicId: auth.canonical,
    tenant_id: auth.canonical,
    patientCount: Array.isArray(snapshot.patients) ? snapshot.patients.length : 0,
    patients: snapshot.patients,
    appointments: snapshot.appointments,
    clinicalRecords: snapshot.clinicalRecords,
    odontograms: snapshot.odontograms,
    diagnosticAids: snapshot.diagnosticAids,
    attachments: snapshot.attachments,
    drafts: snapshot.drafts,
    sync_queue: snapshot.sync_queue,
    serverTime: snapshot.serverTime,
    // full=0 → slim (pacientes, citas y metadatos de exámenes, sin binarios);
    // full=1 → historias/odontogramas sin drafts pesados.
    slim: snapshot.slim === true,
  }
}

function denyIfHeapPressure(res) {
  if (!isHeapNearLimit(0.68)) return false
  sendJson(res, 503, heapPressurePayload(25))
  return true
}

router.get('/clinical', async (req, res) => {
  try {
    const auth = await requireClinicSession(req, res)
    if (!auth) return
    if (denyWithoutClinicalAccess(auth, res)) return
    if (denyIfHeapPressure(res)) return

    const aliases = auth.aliases
    const includeBlobs = booleanQuery(req.query?.includeBlobs ?? req.query?.full, false)
    const snapshot = capTrialSnapshot(
      auth.session.accessTier,
      await pullClinicSnapshot(auth.canonical, aliases, { includeBlobs }),
    )
    return sendJson(res, 200, {
      ...snapshotResponse(auth, snapshot),
      patients: snapshot.patients,
      appointments: snapshot.appointments,
    })
  } catch (error) {
    console.error('[Sync] Error en GET /api/sync/clinical:', error)
    const code = error?.code || ''
    if (code === 'CLINICAL_SYNC_TOO_LARGE' || code === 'HEAP_PRESSURE') {
      return sendJson(res, 503, heapPressurePayload(30))
    }
    return sendJson(res, 500, { success: false, ok: false, error: 'No se pudo leer la sincronización.' })
  }
})

router.get('/pull', async (req, res) => {
  try {
    const auth = await requireClinicSession(req, res)
    if (!auth) return
    if (denyWithoutClinicalAccess(auth, res)) return
    if (denyIfHeapPressure(res)) return

    const aliases = auth.aliases
    // Default false: login usa ?full=0 (metadata). Evita OOM si alguien llama /pull sin query.
    const includeBlobs = booleanQuery(req.query?.includeBlobs ?? req.query?.full, false)
    const slim = !includeBlobs
    const snapshot = capTrialSnapshot(
      auth.session.accessTier,
      await pullClinicSnapshot(auth.canonical, aliases, { includeBlobs, slim }),
    )
    return sendJson(res, 200, snapshotResponse(auth, snapshot))
  } catch (error) {
    console.error('[Sync] Error en GET /api/sync/pull:', error)
    const message = error instanceof Error ? error.message : String(error)
    const code = error?.code || ''
    const metaMissing =
      code === 'SYNC_META_MISSING' || /SYNC_META_MISSING|clinical-sync-meta/i.test(message)
    // OOM / heap / meta → 503 explícito (cliente muestra banner; no lista vacía silenciosa).
    const oom =
      code === 'CLINICAL_SYNC_TOO_LARGE' ||
      code === 'HEAP_PRESSURE' ||
      /heap|out of memory|ENOMEM/i.test(message)
    return sendJson(res, metaMissing || oom ? 503 : 500, {
      success: false,
      ok: false,
      error: metaMissing
        ? 'Índice de pacientes no disponible. Reintente en unos segundos o contacte soporte.'
        : oom
          ? 'El servidor agotó memoria al preparar el sync. Reintente con full=0.'
          : 'No se pudo descargar el snapshot completo de la clínica.',
      code: metaMissing ? 'SYNC_META_MISSING' : oom ? code || 'HEAP_PRESSURE' : 'SYNC_PULL_FAILED',
    })
  }
})

/** Un borrador clínico/valoración al abrir la ficha (el pull global ya no incluye drafts). */
router.get('/draft/:patientSyncId', async (req, res) => {
  try {
    const auth = await requireClinicSession(req, res)
    if (!auth) return
    if (denyWithoutClinicalAccess(auth, res)) return
    if (denyIfHeapPressure(res)) return

    const patientSyncId = String(req.params?.patientSyncId || '').trim()
    if (!patientSyncId) {
      return sendJson(res, 400, { success: false, ok: false, error: 'Falta patientSyncId.' })
    }
    const draft = await pullPatientDraft(auth.canonical, patientSyncId, auth.aliases)
    if (!draft) {
      return sendJson(res, 404, {
        success: false,
        ok: false,
        error: 'No hay borrador de valoración/historia para este paciente en el servidor.',
      })
    }
    return sendJson(res, 200, {
      success: true,
      ok: true,
      clinicId: auth.canonical,
      draft,
    })
  } catch (error) {
    console.error('[Sync] Error en GET /api/sync/draft/:patientSyncId:', error)
    const message = error instanceof Error ? error.message : String(error)
    const code = error?.code || ''
    const oom =
      code === 'CLINICAL_SYNC_TOO_LARGE' ||
      code === 'HEAP_PRESSURE' ||
      /heap|out of memory|ENOMEM/i.test(message)
    return sendJson(res, oom ? 503 : 500, {
      success: false,
      ok: false,
      error: oom
        ? 'El servidor agotó memoria al leer el borrador. Reintente en unos segundos.'
        : 'No se pudo leer el borrador del paciente.',
      code: oom ? code || 'HEAP_PRESSURE' : undefined,
    })
  }
})

router.post('/clinical', async (req, res) => {
  try {
    const auth = await requireClinicSession(req, res)
    if (!auth) return
    if (denyWithoutClinicalAccess(auth, res)) return
    if (denyIfHeapPressure(res)) return

    const body = req.body && typeof req.body === 'object' ? req.body : {}
    if (denyTrialOverflow(auth, body, res)) return
    const aliases = auth.aliases
    const hasExtended =
      Array.isArray(body.clinicalRecords) ||
      Array.isArray(body.diagnosticAids) ||
      Array.isArray(body.attachments) ||
      Array.isArray(body.sync_queue) ||
      Array.isArray(body.syncQueue) ||
      Array.isArray(body.odontograms) ||
      Array.isArray(body.drafts)

    if (hasExtended) {
      const result = await pushClinicSnapshot(auth.canonical, body, aliases)
      return sendJson(res, 200, {
        success: true,
        ok: true,
        clinicId: auth.canonical,
        tenant_id: auth.canonical,
        accepted: result.accepted,
        serverTime: result.serverTime,
      })
    }

    const result = await pushClinicalRecords(
      auth.canonical,
      body.patients,
      body.appointments,
      aliases,
    )
    return sendJson(res, 200, {
      success: true,
      ok: true,
      clinicId: auth.canonical,
      tenant_id: auth.canonical,
      accepted: result.accepted,
      serverTime: result.serverTime,
    })
  } catch (error) {
    if (isGoogleDriveRequiredError(error)) {
      return sendJson(res, error.status || 428, driveRequiredPayload(error))
    }
    console.error('[Sync] Error en POST /api/sync/clinical:', error)
    const code = error?.code || ''
    if (code === 'CLINICAL_SYNC_TOO_LARGE' || code === 'HEAP_PRESSURE') {
      return sendJson(res, 503, heapPressurePayload(30))
    }
    return sendJson(res, 500, { success: false, ok: false, error: 'No se pudo guardar la sincronización.' })
  }
})

router.post('/push', async (req, res) => {
  try {
    const auth = await requireClinicSession(req, res)
    if (!auth) return
    if (denyWithoutClinicalAccess(auth, res)) return
    if (denyIfHeapPressure(res)) return

    const body = req.body && typeof req.body === 'object' ? req.body : {}
    if (denyTrialOverflow(auth, body, res)) return
    const aliases = auth.aliases
    // pushClinicSnapshot ya purga Base64/DataURL antes de escribir.
    const result = await pushClinicSnapshot(auth.canonical, body, aliases)
    return sendJson(res, 200, {
      success: true,
      ok: true,
      clinicId: auth.canonical,
      tenant_id: auth.canonical,
      accepted: result.accepted,
      serverTime: result.serverTime,
    })
  } catch (error) {
    if (isGoogleDriveRequiredError(error)) {
      return sendJson(res, error.status || 428, driveRequiredPayload(error))
    }
    console.error('[Sync] Error en POST /api/sync/push:', error)
    return sendJson(res, 500, { success: false, ok: false, error: 'No se pudo guardar la sincronización.' })
  }
})

router.get('/attachment', async (req, res) => {
  try {
    const auth = await requireClinicSession(req, res)
    if (!auth) return
    if (denyWithoutClinicalAccess(auth, res)) return

    const aliases = auth.aliases
    const query = req.query && typeof req.query === 'object' ? req.query : {}
    const attachment = await findClinicAttachment(
      auth.canonical,
      {
        ...query,
        id: query.id || query.fileId || query.aidId,
        aidId: query.aidId || query.id || query.fileId,
        fileHash: query.fileHash || query.hash,
        patientId: query.patientId || query.patientSyncId,
        encounterId: query.encounterId || query.evolutionId,
      },
      aliases,
    )
    if (!attachment) {
      return sendJson(res, 404, {
        success: false,
        ok: false,
        error: 'El archivo no está en el snapshot de la clínica.',
      })
    }
    return sendJson(res, 200, {
      success: true,
      ok: true,
      clinicId: auth.canonical,
      tenant_id: auth.canonical,
      attachment,
    })
  } catch (error) {
    if (isGoogleDriveRequiredError(error)) {
      return sendJson(res, error.status || 428, driveRequiredPayload(error))
    }
    console.error('[Sync] Error en GET /api/sync/attachment:', error)
    return sendJson(res, 500, { success: false, ok: false, error: 'No se pudo descargar el archivo.' })
  }
})

router.get('/files/:fileId', async (req, res) => {
  try {
    const auth = await requireClinicSession(req, res)
    if (!auth) return
    if (denyWithoutClinicalAccess(auth, res)) return

    const aliases = auth.aliases
    const query = {
      ...(req.query && typeof req.query === 'object' ? req.query : {}),
      id: req.params.fileId,
      aidId: req.params.fileId,
      fileId: req.params.fileId,
    }
    const attachment = await findClinicAttachment(auth.canonical, query, aliases)
    if (!attachment) {
      return sendJson(res, 404, {
        success: false,
        ok: false,
        error: 'El archivo no está en el snapshot de la clínica.',
      })
    }
    return sendJson(res, 200, {
      success: true,
      ok: true,
      clinicId: auth.canonical,
      tenant_id: auth.canonical,
      attachment,
    })
  } catch (error) {
    if (isGoogleDriveRequiredError(error)) {
      return sendJson(res, error.status || 428, driveRequiredPayload(error))
    }
    console.error('[Sync] Error en GET /api/sync/files:', error)
    return sendJson(res, 500, { success: false, ok: false, error: 'No se pudo descargar el archivo.' })
  }
})

export default router
