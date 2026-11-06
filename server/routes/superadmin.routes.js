/**
 * API del Panel de Control. verificarToken + soloSuperAdmin:
 * solo la sesión con is_superadmin (cuenta maestra) pasa.
 */
import { Router } from 'express'
import { soloSuperAdmin, verificarToken } from '../middleware/tenantAuth.middleware.js'
import {
  forceOfflineSync,
  getDashboardMetrics,
  getInfrastructure,
  getSystemSettings,
  listIntegrationLogs,
  listSubscriptions,
  listTenants,
  pingMinsaludEndpoint,
  suspendTenant,
} from '../services/superadminDashboard.js'

const router = Router()

router.use(verificarToken, soloSuperAdmin)

router.get('/metrics', async (_req, res, next) => {
  try {
    res.json({ ok: true, ...(await getDashboardMetrics()) })
  } catch (error) {
    next(error)
  }
})

router.get('/infrastructure', (_req, res) => {
  res.json({ ok: true, ...getInfrastructure() })
})

router.get('/tenants', async (_req, res, next) => {
  try {
    const result = await listTenants()
    res.json({ ok: true, ...result })
  } catch (error) {
    next(error)
  }
})

router.get('/tenants/:id', async (req, res, next) => {
  try {
    const result = await listTenants()
    const tenant = result.tenants.find((item) => item.id === req.params.id)
    if (!tenant) {
      return res.status(404).json({ ok: false, error: 'Clínica no encontrada.' })
    }
    res.json({ ok: true, source: result.source, tenant })
  } catch (error) {
    next(error)
  }
})

router.post('/tenants/:id/suspend', async (req, res, next) => {
  try {
    const status = req.body?.status === 'activa' ? 'activa' : 'suspendida'
    const tenant = await suspendTenant(req.params.id, status)
    if (!tenant) {
      return res.status(404).json({ ok: false, error: 'Clínica no encontrada.' })
    }
    console.info(
      `[superadmin] ${status === 'suspendida' ? 'suspensión' : 'reactivación'} clínica ${tenant.id} actor=${req.user?.id ?? 'desconocido'}`,
    )
    res.json({
      ok: true,
      tenant,
      message:
        status === 'suspendida'
          ? 'La cuenta de la clínica quedó suspendida.'
          : 'La cuenta de la clínica quedó activa de nuevo.',
    })
  } catch (error) {
    next(error)
  }
})

router.post('/tenants/:id/sync', async (req, res, next) => {
  try {
    const result = await forceOfflineSync(req.params.id)
    if (!result) {
      return res.status(404).json({ ok: false, error: 'Clínica no encontrada.' })
    }
    console.info(
      `[superadmin] sync offline clínica ${result.tenant.id} actor=${req.user?.id ?? 'desconocido'}`,
    )
    res.json({ ok: true, ...result })
  } catch (error) {
    next(error)
  }
})

router.get('/logs', async (_req, res, next) => {
  try {
    res.json({ ok: true, ...(await listIntegrationLogs()) })
  } catch (error) {
    next(error)
  }
})

router.post('/ping/minsalud', async (_req, res, next) => {
  try {
    res.json(await pingMinsaludEndpoint())
  } catch (error) {
    next(error)
  }
})

router.get('/subscriptions', (_req, res) => {
  res.json({ ok: true, ...listSubscriptions() })
})

router.get('/settings', (_req, res) => {
  res.json({ ok: true, ...getSystemSettings() })
})

export default router
