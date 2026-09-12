import { Router } from 'express'
import {
  resolveSubscriptionSession,
  sessionHintFromRequest,
} from '../services/subscriptionAuthStore.js'
import { clinicSyncAliasIds } from '../../shared/clinicalSyncScope.js'
import {
  findClinicAttachment,
  pullClinicSnapshot,
  pushClinicSnapshot,
  pushClinicalRecords,
} from '../services/clinicalSyncStore.js'

const router = Router()

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

function aliasesWithTenant(auth, tenantId) {
  const aliases = [...auth.aliases]
  if (!tenantId) return aliases
  if (tenantId === auth.canonical || aliases.includes(tenantId)) return aliases
  const prefixed = tenantId.startsWith('clinic:') ? tenantId : `clinic:${tenantId}`
  if (prefixed === auth.canonical || aliases.includes(prefixed)) {
    aliases.push(tenantId, prefixed)
    return [...new Set(aliases)]
  }
  return aliases
}

async function requireClinicSession(req, res) {
  const session = await resolveSubscriptionSession(bearerToken(req), sessionHintFromRequest(req))
  if (!session?.user) {
    res.status(401).json({ success: false, ok: false, error: 'Sesión inválida o expirada.' })
    return null
  }
  const scope = clinicSyncAliasIds(session.user)
  if (!scope.canonical) {
    res.status(400).json({ success: false, ok: false, error: 'La sesión no tiene clínica asociada.' })
    return null
  }
  return { session, ...scope }
}

function snapshotResponse(auth, snapshot) {
  return {
    success: true,
    ok: true,
    clinicId: auth.canonical,
    tenant_id: auth.canonical,
    patients: snapshot.patients,
    appointments: snapshot.appointments,
    clinicalRecords: snapshot.clinicalRecords,
    odontograms: snapshot.odontograms,
    diagnosticAids: snapshot.diagnosticAids,
    attachments: snapshot.attachments,
    drafts: snapshot.drafts,
    sync_queue: snapshot.sync_queue,
    serverTime: snapshot.serverTime,
  }
}

router.get('/clinical', async (req, res) => {
  try {
    const auth = await requireClinicSession(req, res)
    if (!auth) return

    const aliases = aliasesWithTenant(auth, tenantIdFromRequest(req))
    const includeBlobs = booleanQuery(req.query?.includeBlobs ?? req.query?.full, false)
    const snapshot = await pullClinicSnapshot(auth.canonical, aliases, { includeBlobs })
    return res.json({
      ...snapshotResponse(auth, snapshot),
      patients: snapshot.patients,
      appointments: snapshot.appointments,
    })
  } catch (error) {
    console.error('[Sync] Error en GET /api/sync/clinical:', error)
    return res.status(500).json({ success: false, ok: false, error: 'No se pudo leer la sincronización.' })
  }
})

router.get('/pull', async (req, res) => {
  try {
    const auth = await requireClinicSession(req, res)
    if (!auth) return

    const aliases = aliasesWithTenant(auth, tenantIdFromRequest(req))
    const includeBlobs = booleanQuery(req.query?.includeBlobs ?? req.query?.full, true)
    const snapshot = await pullClinicSnapshot(auth.canonical, aliases, { includeBlobs })
    return res.json(snapshotResponse(auth, snapshot))
  } catch (error) {
    console.error('[Sync] Error en GET /api/sync/pull:', error)
    return res.status(500).json({
      success: false,
      ok: false,
      error: 'No se pudo descargar el snapshot completo de la clínica.',
    })
  }
})

router.post('/clinical', async (req, res) => {
  try {
    const auth = await requireClinicSession(req, res)
    if (!auth) return

    const body = req.body && typeof req.body === 'object' ? req.body : {}
    const aliases = aliasesWithTenant(auth, tenantIdFromRequest(req))
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
      return res.json({
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
    return res.json({
      success: true,
      ok: true,
      clinicId: auth.canonical,
      tenant_id: auth.canonical,
      accepted: result.accepted,
      serverTime: result.serverTime,
    })
  } catch (error) {
    console.error('[Sync] Error en POST /api/sync/clinical:', error)
    return res.status(500).json({ success: false, ok: false, error: 'No se pudo guardar la sincronización.' })
  }
})

router.post('/push', async (req, res) => {
  try {
    const auth = await requireClinicSession(req, res)
    if (!auth) return

    const body = req.body && typeof req.body === 'object' ? req.body : {}
    const aliases = aliasesWithTenant(auth, tenantIdFromRequest(req))
    const result = await pushClinicSnapshot(auth.canonical, body, aliases)
    return res.json({
      success: true,
      ok: true,
      clinicId: auth.canonical,
      tenant_id: auth.canonical,
      accepted: result.accepted,
      serverTime: result.serverTime,
    })
  } catch (error) {
    console.error('[Sync] Error en POST /api/sync/push:', error)
    return res.status(500).json({ success: false, ok: false, error: 'No se pudo guardar la sincronización.' })
  }
})

router.get('/attachment', async (req, res) => {
  try {
    const auth = await requireClinicSession(req, res)
    if (!auth) return

    const aliases = aliasesWithTenant(auth, tenantIdFromRequest(req))
    const query = req.query && typeof req.query === 'object' ? req.query : {}
    const attachment = await findClinicAttachment(auth.canonical, query, aliases)
    if (!attachment) {
      return res.status(404).json({
        success: false,
        ok: false,
        error: 'El archivo no está en el snapshot de la clínica.',
      })
    }
    return res.json({
      success: true,
      ok: true,
      clinicId: auth.canonical,
      tenant_id: auth.canonical,
      attachment,
    })
  } catch (error) {
    console.error('[Sync] Error en GET /api/sync/attachment:', error)
    return res.status(500).json({ success: false, ok: false, error: 'No se pudo descargar el archivo.' })
  }
})

router.get('/files/:fileId', async (req, res) => {
  try {
    const auth = await requireClinicSession(req, res)
    if (!auth) return

    const aliases = aliasesWithTenant(auth, tenantIdFromRequest(req))
    const query = {
      ...(req.query && typeof req.query === 'object' ? req.query : {}),
      id: req.params.fileId,
      aidId: req.params.fileId,
    }
    const attachment = await findClinicAttachment(auth.canonical, query, aliases)
    if (!attachment) {
      return res.status(404).json({
        success: false,
        ok: false,
        error: 'El archivo no está en el snapshot de la clínica.',
      })
    }
    return res.json({
      success: true,
      ok: true,
      clinicId: auth.canonical,
      tenant_id: auth.canonical,
      attachment,
    })
  } catch (error) {
    console.error('[Sync] Error en GET /api/sync/files:', error)
    return res.status(500).json({ success: false, ok: false, error: 'No se pudo descargar el archivo.' })
  }
})

export default router
