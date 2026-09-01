import 'dotenv/config'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const port = Number(process.env.PORT ?? 3000)

/** URL de PostgreSQL requerida por la aplicación (local o producción). */
export const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/software_dental'

export const config = {
  port,
  nodeEnv: process.env.NODE_ENV ?? 'development',
  databaseUrl: DATABASE_URL,
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
  minsalud: {
    sandbox: process.env.MINSALUD_SANDBOX !== 'false',
    apiBaseUrl: (process.env.MINSALUD_API_BASE_URL ?? '').replace(/\/$/, ''),
    authUrl: process.env.MINSALUD_AUTH_URL ?? '',
    validatePath: process.env.MINSALUD_VALIDATE_URL ?? '/api/v1/rips/validar',
    clientId: process.env.MINSALUD_CLIENT_ID ?? '',
    clientSecret: process.env.MINSALUD_CLIENT_SECRET ?? '',
    username: process.env.MINSALUD_USERNAME ?? '',
    password: process.env.MINSALUD_PASSWORD ?? '',
    nit: process.env.MINSALUD_NIT ?? '',
  },
  dian: {
    softwareId: process.env.DIAN_SOFTWARE_ID ?? 'SOFTWARE-DENTAL-EMR',
    technicalKey: process.env.DIAN_TECHNICAL_KEY ?? '',
  },
  dataDir: join(__dirname, 'data'),
  appPublicUrl: (process.env.APP_PUBLIC_URL ?? process.env.CORS_ORIGIN ?? 'http://localhost:5173').replace(
    /\/$/,
    '',
  ),
  smtp: {
    host: process.env.SMTP_HOST ?? '',
    port: Number(process.env.SMTP_PORT ?? 587),
    user: process.env.SMTP_USER ?? '',
    pass: process.env.SMTP_PASS ?? '',
    from:
      process.env.MAIL_FROM ??
      process.env.SMTP_USER ??
      'doctorSEOlabs <noreply@mihistoriadental.com>',
  },
  superAdmin: {
    email: (process.env.SUPERADMIN_EMAIL ?? 'doctormauriciosoto@gmail.com').toLowerCase(),
    password: 'Dragon1976%',
    nombre: process.env.SUPERADMIN_NAME ?? 'Dr. Mauricio Soto',
  },
}

/** Credenciales completas para modo producción contra el API del ministerio. */
export function hasMinsaludCredentials() {
  const { clientId, clientSecret, username, password, apiBaseUrl } = config.minsalud
  return Boolean(
    apiBaseUrl &&
      ((clientId && clientSecret) || (username && password)),
  )
}

export default config

const invokedDirectly =
  Boolean(process.argv[1]) && pathToFileURL(process.argv[1]).href === import.meta.url

if (invokedDirectly) {
  console.log('[config] Módulo válido')
  console.log(`[config] DATABASE_URL=${config.databaseUrl}`)
  console.log(`[config] SuperAdmin=${config.superAdmin.email} rol=superadmin estado_pago=exento`)
}
