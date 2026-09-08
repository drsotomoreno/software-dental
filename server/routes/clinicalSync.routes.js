import { Router } from 'express'
import {
  resolveSubscriptionSession,
  sessionHintFromRequest,
} from '../services/subscriptionAuthStore.js'
import { pullClinicalRecords, pushClinicalRecords } from '../services/clinicalSyncStore.js'

const router = Router()

function bearerToken(req) {
  const authHeader = req.headers.authorization ?? ''
  return authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null
}

function clinicIdOf(user) {
  return String(user?.clinicId || user?.id || '').trim()
}

async function requireClinicSession(req, res) {
  const session = await resolveSubscriptionSession(bearerToken(req), sessionHintFromRequest(req))
  if (!session?.user) {
    res.status(401).json({ success: false, ok: false, error: 'Sesión inválida o expirada.' })
    return null
  }
  const clinicId = clinicIdOf(session.user)
  if (!clinicId) {
    res.status(400).json({ success: false, ok: false, error: 'La sesión no tiene clínica asociada.' })
    return null
  }
  return { session, clinicId }
}

router.get('/clinical', async (req, res) => {
  try {
    const auth = await requireClinicSession(req, res)
    if (!auth) return

    const since = typeof req.query?.since === 'string' ? req.query.since : ''
    const result = await pullClinicalRecords(auth.clinicId, since)
    return res.json({
      success: true,
      ok: true,
      clinicId: auth.clinicId,
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
    const result = await pushClinicalRecords(auth.clinicId, body.patients, body.appointments)
    return res.json({
      success: true,
      ok: true,
      clinicId: auth.clinicId,
      accepted: result.accepted,
      serverTime: result.serverTime,
    })
  } catch (error) {
    console.error('[Sync] Error en POST /api/sync/clinical:', error)
    return res.status(500).json({ success: false, ok: false, error: 'No se pudo guardar la sincronización.' })
  }
})

export default router
