/**
 * Montaje: app.use('/api/whatsapp', whatsappRoutes)
 */
import { Router } from 'express'
import {
  createWhatsappCheckout,
  getWhatsappStatus,
  listWhatsappNoShows,
  patchWhatsappNoShow,
  patchWhatsappSettings,
} from '../controllers/whatsapp.controller.js'
import { verificarToken } from '../middleware/tenantAuth.middleware.js'
import {
  attachWhatsappSession,
  requirePaidWhatsappSubscription,
} from '../middleware/whatsappPaidSubscription.middleware.js'

const router = Router()

router.use(verificarToken)
router.use(attachWhatsappSession)

router.get('/status', getWhatsappStatus)
router.patch('/settings', patchWhatsappSettings)

router.post('/checkout', requirePaidWhatsappSubscription, createWhatsappCheckout)

router.get('/no-shows', listWhatsappNoShows)
router.patch('/no-shows/:id', patchWhatsappNoShow)

export default router
