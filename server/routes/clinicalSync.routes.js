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

    const result = await pullClinicalRecords(auth.canonical, '', auth.aliases)
    return res.json({
      success: true,
      ok: true,
      clinicId: auth.canonical,
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
    const result = await pushClinicalRecords(
      auth.canonical,
      body.patients,
      body.appointments,
      auth.aliases,
    )
    return res.json({
      success: true,
      ok: true,
      clinicId: auth.canonical,
      accepted: result.accepted,
      serverTime: result.serverTime,
    })
  } catch (error) {
    console.error('[Sync] Error en POST /api/sync/clinical:', error)
    return res.status(500).json({ success: false, ok: false, error: 'No se pudo guardar la sincronización.' })
  }
})

export default router
