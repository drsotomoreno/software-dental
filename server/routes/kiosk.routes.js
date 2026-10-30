import { Router } from 'express'
import { requireKioskAuth } from '../middleware/kioskAuth.middleware.js'
import { createKioskIntake } from '../controllers/kiosk.controller.js'

const router = Router()

/**
 * POST /api/v1/kiosk/intake
 * Otros métodos sobre la misma ruta → 403 (middleware).
 */
router.all('/intake', requireKioskAuth, createKioskIntake)

export default router
