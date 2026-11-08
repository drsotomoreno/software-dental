import { Router } from 'express'
import { requireKioskAuth } from '../middleware/kioskAuth.middleware.js'
import { createKioskIntake } from '../controllers/kiosk.controller.js'
import { createKioskSignature } from '../controllers/kioskSignature.controller.js'
import { getKioskLanLink } from '../controllers/kioskLan.controller.js'

const router = Router()

/** Sesión del PC clínico: IP local + URL completa del kiosco. */
router.get('/lan-link', getKioskLanLink)

/**
 * POST /api/v1/kiosk/intake
 * Otros métodos sobre la misma ruta → 403 (middleware).
 */
router.all('/intake', requireKioskAuth, createKioskIntake)

/** Respaldo HTTP de firma cuando Socket.IO hace timeout. */
router.all('/signature', requireKioskAuth, createKioskSignature)

export default router
