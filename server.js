/**
 * Servidor API RIPS — Validación MinSalud (SISPRO/PISIS) y generación FEV-Salud DIAN
 * Ejecutar: npm run server  →  http://localhost:3000
 */
import express from 'express'
import cors from 'cors'
import { config } from './server/config.js'
import { errorHandler } from './server/middleware/errorHandler.js'
import healthRoutes from './server/routes/health.routes.js'
import ripsRoutes from './server/routes/rips.routes.js'
import invoicesRoutes from './server/routes/invoices.routes.js'
import authRoutes from './server/routes/auth.routes.js'
import { ensureSuperAdmin } from './server/services/subscriptionAuthStore.js'

const app = express()

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true)
      const allowed =
        /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin) ||
        origin === config.corsOrigin
      callback(null, allowed)
    },
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }),
)
app.use(express.json({ limit: '5mb' }))

app.use('/api/health', healthRoutes)
app.use('/api/rips', ripsRoutes)
app.use('/api/invoices', invoicesRoutes)
app.use('/api', authRoutes)

app.use(errorHandler)

await ensureSuperAdmin()

app.listen(config.port, () => {
  console.log(`[RIPS API] Escuchando en http://localhost:${config.port}`)
  console.log(`[Auth] SuperAdmin exento: ${config.superAdmin.email}`)
  console.log(
    `[RIPS API] Modo MinSalud: ${config.minsalud.sandbox ? 'SANDBOX (local)' : 'PRODUCCIÓN'}`,
  )
})
