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
import { mailTransportLabel } from './server/services/mailer.js'
import { ensureSuperAdmin } from './server/services/subscriptionAuthStore.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true)
      const allowed =
        /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin) ||
        origin === config.corsOrigin ||
        /^https:\/\/([a-z0-9-]+\.)?mihistoriadental\.com$/.test(origin)
      callback(null, allowed)
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Accept',
      'X-Client-Email',
      'X-Client-User-Id',
    ],
  }),
)
app.use(express.json({ limit: '5mb' }))

app.use('/api/health', healthRoutes)
app.use('/api/rips', ripsRoutes)
app.use('/api/invoices', invoicesRoutes)
app.use('/api', authRoutes)

const distDir = path.join(__dirname, 'dist')
const distIndex = path.join(distDir, 'index.html')
const hasFrontendBuild = existsSync(distIndex)
const isProduction = process.env.NODE_ENV === 'production'

await ensureSuperAdmin()

export { config, DATABASE_URL }

if (isProduction) {
  if (!hasFrontendBuild) {
    console.error(
      '[RIPS API] Falta dist/index.html. En Render el Build Command debe ser: npm run build',
    )
  }
  app.use(
    express.static(distDir, {
      setHeaders(res, filePath) {
        if (filePath.endsWith('.html')) {
          res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
        }
      },
    }),
  )
  app.get('/{*splat}', (req, res, next) => {
    if (req.path.startsWith('/api')) return next()
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
    res.sendFile(distIndex)
  })
} else {
  try {
    const { readFileSync } = await import('node:fs')
    const { createServer: createViteServer } = await import('vite')
    const vite = await createViteServer({
      server: { middlewareMode: true, allowedHosts: true },
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
    console.log('[RIPS API] Frontend de desarrollo: Vite (no se usa dist/ hasta NODE_ENV=production).')
  } catch (error) {
    if (hasFrontendBuild) {
      console.warn(
        '[RIPS API] Vite no arrancó; se sirve dist/ (puede estar desactualizado).',
        error?.message ?? error,
      )
      app.use(express.static(distDir))
      app.get('/{*splat}', (req, res, next) => {
        if (req.path.startsWith('/api')) return next()
        res.sendFile(distIndex)
      })
    } else {
      console.error(
        '[RIPS API] No se encontró dist/index.html ni Vite. Ejecuta "npm run build" o "npm run dev".',
        error?.message ?? error,
      )
    }
  }
}

app.use(errorHandler)

app.listen(config.port, '0.0.0.0', () => {
  console.log(`[RIPS API] App y API en http://0.0.0.0:${config.port}`)
  console.log(`[config] DATABASE_URL=${DATABASE_URL}`)
  console.log(`[Auth] SuperAdmin exento: ${config.superAdmin.email}`)
  void mailTransportLabel().then((label) => {
    console.log(`[Auth] Correo transaccional: ${label} (${config.appPublicUrl})`)
  })
  console.log(
    `[RIPS API] Modo MinSalud: ${config.minsalud.sandbox ? 'SANDBOX (local)' : 'PRODUCCIÓN'}`,
  )
})
