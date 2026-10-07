import 'dotenv/config'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'
import { credentialsAreConfigured, readMinsaludAuthSettings } from './services/minsalud/settings.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const port = Number(process.env.PORT) || 3000

const LOCAL_DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/software_dental'

function resolveDatabaseUrl(fromEnv = process.env.DATABASE_URL) {
  const trimmed = typeof fromEnv === 'string' ? fromEnv.trim() : ''
  return trimmed || LOCAL_DATABASE_URL
}

function redactDatabaseUrl(url) {
  try {
    const parsed = new URL(url)
    if (parsed.password) parsed.password = '***'
    return parsed.toString()
  } catch {
    return '(sin URL)'
  }
}

/** URL de PostgreSQL: la de Render (DATABASE_URL) o el Postgres local de desarrollo. */
export const DATABASE_URL = resolveDatabaseUrl()

export const config = {
  port,
  nodeEnv: process.env.NODE_ENV ?? 'development',
  databaseUrl: DATABASE_URL,
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
  minsalud: {
    sandbox: process.env.MINSALUD_SANDBOX !== 'false',
    validatePath: process.env.MINSALUD_VALIDATE_URL ?? '/api/v1/rips/validar',
    ...readMinsaludAuthSettings(process.env),
  },
  dian: {
    softwareId: process.env.DIAN_SOFTWARE_ID ?? 'SOFTWARE-DENTAL-EMR',
    technicalKey: process.env.DIAN_TECHNICAL_KEY ?? '',
  },
  dataDir: join(__dirname, 'data'),
  appPublicUrl: (
    process.env.APP_PUBLIC_URL ||
    (process.env.NODE_ENV === 'production'
      ? 'https://www.mihistoriadental.com'
      : process.env.CORS_ORIGIN || 'http://localhost:5173')
  ).replace(/\/$/, ''),
  mail: {
    resendApiKey: process.env.RESEND_API_KEY ?? '',
    sendgridApiKey: process.env.SENDGRID_API_KEY ?? '',
    brevoApiKey: process.env.BREVO_API_KEY ?? '',
    resendFrom:
      process.env.MAIL_FROM ??
      'Doctor SEO Labs <notificaciones@mihistoriadental.com>',
  },
  smtp: {
    host: process.env.SMTP_HOST ?? '',
    port: Number(process.env.SMTP_PORT ?? 587),
    user: process.env.SMTP_USER ?? '',
    pass: process.env.SMTP_PASS ?? '',
    from:
      process.env.MAIL_FROM ??
      'Doctor SEO Labs <notificaciones@mihistoriadental.com>',
  },
  superAdmin: {
    email: (process.env.SUPERADMIN_EMAIL ?? 'doctormauriciosoto@gmail.com').toLowerCase(),
    password: 'Dragon1976%',
    nombre: process.env.SUPERADMIN_NAME ?? 'Dr. Mauricio Soto',
  },
}

/** Credenciales completas para LoginSISPRO o para el gateway client_credentials. */
export function hasMinsaludCredentials() {
  return credentialsAreConfigured(config.minsalud)
}

export default config

const invokedDirectly =
  Boolean(process.argv[1]) && pathToFileURL(process.argv[1]).href === import.meta.url

if (invokedDirectly) {
  console.log('[config] Módulo válido')
  console.log(`[config] DATABASE_URL=${redactDatabaseUrl(config.databaseUrl)}`)
  console.log(`[config] SuperAdmin=${config.superAdmin.email} rol=superadmin estado_pago=exento`)
}
