import { Router } from 'express'
import { findCuvRecordByFactura } from '../services/cuvRepository.js'

const router = Router()

/**
 * GET /api/cuv/:numFactura
 * Estado y CUV de una factura (pendiente o aprobado).
 */
router.get('/:numFactura', async (req, res) => {
  try {
    const { numFactura } = req.params
    const record = await findCuvRecordByFactura(numFactura)

    if (!record) {
      return res.status(404).json({
        success: false,
        message: `No se encontró un registro de CUV para la factura ${numFactura}`,
      })
    }

    return res.json({
      success: true,
      data: record,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return res.status(500).json({
      success: false,
      error: message,
    })
  }
})

export default router
