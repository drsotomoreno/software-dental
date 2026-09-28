import { Router } from 'express'
import { config, hasMinsaludCredentials } from '../config.js'
import { isMailConfigured, mailTransportLabel } from '../services/mailer.js'
import { resolveMuvAmbiente } from '../services/muvAmbiente.js'

const router = Router()

router.get('/', async (_req, res) => {
  res.json({
    service: 'doctorSEOlabs Historia Dental Dictada por Voz — API RIPS / CUV / DIAN',
    version: '1.0.0',
    minsalud: {
      sandbox: config.minsalud.sandbox,
      credentialsConfigured: hasMinsaludCredentials(),
      ambiente: resolveMuvAmbiente().id,
      apiBaseUrl: resolveMuvAmbiente().apiBaseUrl,
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
