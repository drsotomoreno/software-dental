/**
 * Servidor unificado: API RIPS + interfaz web
 * Ejecutar: npm run server  →  http://localhost:3000
 */
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import cors from 'cors'
import { config, DATABASE_URL } from './server/config.js'
import { errorHandler } from './server/middleware/errorHandler.js'
import healthRoutes from './server/routes/health.routes.js'
import ripsRoutes from './server/routes/rips.routes.js'
import invoicesRoutes from './server/routes/invoices.routes.js'
import authRoutes from './server/routes/auth.routes.js'
import { ensureSuperAdmin } from './server/services/subscriptionAuthStore.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
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

const distIndex = path.join(__dirname, 'dist', 'index.html')
const hasFrontendBuild = existsSync(distIndex)

if (!hasFrontendBuild) {
  try {
    const { readFileSync } = await import('node:fs')
    const { createServer: createViteServer } = await import('vite')
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    })
    app.use(vite.middlewares)
    app.use(async (req, res, next) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') return next()
      if (req.path.startsWith('/api')) return next()
      try {
        const template = readFileSync(path.join(__dirname, 'index.html'), 'utf-8')
        const html = await vite.transformIndexHtml(req.originalUrl, template)
        res.status(200).set({ 'Content-Type': 'text/html; charset=utf-8' }).end(html)
      } catch (error) {
        next(error)
      }
    })
  } catch (error) {
    console.error(
      '[RIPS API] No se encontró dist/index.html ni Vite. Ejecuta "npm run build" antes de desplegar.',
      error?.message ?? error,
    )
  }
}

await ensureSuperAdmin()

export { config, DATABASE_URL }

app.use(express.static(path.join(__dirname, 'dist')))
app.get('/{*splat}', (req, res, next) => {
  if (req.path.startsWith('/api')) return next()
  res.sendFile(path.join(__dirname, 'dist', 'index.html'))
})

app.use(errorHandler)

app.listen(config.port, () => {
  console.log(`[RIPS API] App y API en http://localhost:${config.port}`)
  console.log(`[config] DATABASE_URL=${DATABASE_URL}`)
  console.log(`[Auth] SuperAdmin exento: ${config.superAdmin.email}`)
  console.log(
    `[RIPS API] Modo MinSalud: ${config.minsalud.sandbox ? 'SANDBOX (local)' : 'PRODUCCIÓN'}`,
  )
})
