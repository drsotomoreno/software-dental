import { Router } from 'express'
import { config, hasMinsaludCredentials } from '../config.js'
import { isMailConfigured, mailTransportLabel } from '../services/mailer.js'

const router = Router()

router.get('/', async (_req, res) => {
  res.json({
    service: 'doctorSEOlabs Historia Dental Dictada por Voz — API RIPS / CUV / DIAN',
    version: '1.0.0',
    minsalud: {
      sandbox: config.minsalud.sandbox,
      credentialsConfigured: hasMinsaludCredentials(),
    },
    mail: {
      configured: await isMailConfigured(),
      transport: await mailTransportLabel(),
    },
  })
})

export default router
