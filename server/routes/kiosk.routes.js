import { Router } from 'express'
import { requireKioskAuth } from '../middleware/kioskAuth.middleware.js'
import { createKioskIntake } from '../controllers/kiosk.controller.js'
import { getKioskLanLink } from '../controllers/kioskLan.controller.js'

const router = Router()

/** Sesión del PC clínico: IP local + URL completa del kiosco. */
router.get('/lan-link', getKioskLanLink)

/**
 * POST /api/v1/kiosk/intake
 * Otros métodos sobre la misma ruta → 403 (middleware).
 */
router.all('/intake', requireKioskAuth, createKioskIntake)

export default router
