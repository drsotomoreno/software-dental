import { Router } from 'express'
import {
  getLegalizationTransaction,
  legalizeElectronicPayment,
  listLegalizationTransactions,
} from '../controllers/payments.controller.js'

const router = Router()

router.post('/legalize', legalizeElectronicPayment)
router.get('/transactions/:id', getLegalizationTransaction)
router.get('/transactions', listLegalizationTransactions)

export default router
