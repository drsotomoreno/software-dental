import { Router } from 'express'
import { TECNOLOGIAS, TIPOS_DOCUMENTO } from '../services/fevcd/catalogs.js'
import { consultarCompraDirecta, enviarCompraDirecta } from '../services/fevcd/service.js'
import { resolveFevcdSettings } from '../services/fevcd/settings.js'

const router = Router()

router.get('/config', (_req, res) => {
  const settings = resolveFevcdSettings()
  res.json({
    success: true,
    ambiente: settings.ambiente,
    preliminar: settings.preliminar,
    sandbox: settings.sandbox,
    apiBaseUrl: settings.apiBaseUrl,
    tecnologias: TECNOLOGIAS,
    tiposDocumento: TIPOS_DOCUMENTO,
    sinRips: true,
  })
})

router.post('/compra-directa', async (req, res, next) => {
  try {
    const result = await enviarCompraDirecta(req.body ?? {})
    res.status(result.success ? 200 : 422).json(result)
  } catch (error) {
    next(error)
  }
})

router.post('/consultar', async (req, res, next) => {
  try {
    const result = await consultarCompraDirecta(req.body ?? {})
    res.status(result.success ? 200 : 422).json(result)
  } catch (error) {
    next(error)
  }
})

export default router
