import { Router } from 'express'
import {
  resolveSubscriptionSession,
  sessionHintFromRequest,
} from '../services/subscriptionAuthStore.js'
import { clinicSyncAliasIds } from '../../shared/clinicalSyncScope.js'
import { pullClinicalRecords, pushClinicalRecords } from '../services/clinicalSyncStore.js'

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

router.get('/clinical', async (req, res) => {
  try {
    const auth = await requireClinicSession(req, res)
    if (!auth) return

    const aliases = aliasesWithTenant(auth, tenantIdFromRequest(req))
    const result = await pullClinicalRecords(auth.canonical, '', aliases)
    return res.json({
      success: true,
      ok: true,
      clinicId: auth.canonical,
      tenant_id: auth.canonical,
      patients: result.patients,
      appointments: result.appointments,
      serverTime: result.serverTime,
    })
  } catch (error) {
    console.error('[Sync] Error en GET /api/sync/clinical:', error)
    return res.status(500).json({ success: false, ok: false, error: 'No se pudo leer la sincronización.' })
  }
})

router.post('/clinical', async (req, res) => {
  try {
    const auth = await requireClinicSession(req, res)
    if (!auth) return

    const body = req.body && typeof req.body === 'object' ? req.body : {}
    const aliases = aliasesWithTenant(auth, tenantIdFromRequest(req))
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

export default router
