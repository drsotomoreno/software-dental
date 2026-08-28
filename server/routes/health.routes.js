import { Router } from 'express'
import { config, hasMinsaludCredentials } from '../config.js'

const router = Router()

router.get('/', (_req, res) => {
  res.json({
    service: 'doctorSEOlabs Historia Dental Dictada por Voz — API RIPS / CUV / DIAN',
    version: '1.0.0',
    minsalud: {
      sandbox: config.minsalud.sandbox,
      credentialsConfigured: hasMinsaludCredentials(),
    },
  })
})

export default router
