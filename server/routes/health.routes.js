import { Router } from 'express'
import { config, hasDianCredentials, hasMinsaludCredentials } from '../config.js'
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
    dian: {
      sandbox: config.dian.sandbox,
      credentialsConfigured: hasDianCredentials(),
    },
    dualValidation: {
      order: ['DIAN_XML', 'CUFE', 'RIPS_CUFE', 'MUV_PACKAGE', 'CUV'],
    },
    mail: {
      configured: await isMailConfigured(),
      transport: await mailTransportLabel(),
    },
    ripsMonthly: {
      timezone: 'America/Bogota',
      cron: '0 2 1 * *',
    },
  })
})

export default router
