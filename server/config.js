import { existsSync } from 'node:fs'
import { config as loadDotenv } from 'dotenv'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, '..')

/**
 * Carga .env desde cwd (PM2 --cwd) o raíz del repo.
 * Evita DATABASE_URL vacío cuando PM2 arranca sin env_file.
 */
function loadEnvFiles() {
  const candidates = [
    join(process.cwd(), '.env'),
    join(projectRoot, '.env'),
    join(__dirname, '.env'),
  ]
  const seen = new Set()
  for (const envPath of candidates) {
    const key = String(envPath)
    if (seen.has(key) || !existsSync(envPath)) continue
    seen.add(key)
    loadDotenv({ path: envPath, override: false })
  }
}
loadEnvFiles()

const port = Number(process.env.PORT) || 3000

const LOCAL_DATABASE_URL = 'postgresql://postgres:postgres@localhost:1234/software_dental'

function resolveDatabaseUrl(fromEnv = process.env.DATABASE_URL) {
  const trimmed = typeof fromEnv === 'string' ? fromEnv.trim() : ''
  const production = process.env.NODE_ENV === 'production' || process.env.RENDER === 'true'
  if (production) {
    if (!trimmed) {
      console.error(
        '[config] NODE_ENV=production exige DATABASE_URL con el endpoint de AWS RDS. No se usa el Postgres local.',
      )
    }
    return trimmed
  }
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

/** Origen canónico de producción (localStorage / OAuth / correos). Siempre con www. */
export const CANONICAL_PRODUCTION_ORIGIN = 'https://www.mihistoriadental.com'

/**
 * Unifica apex → www para mihistoriadental.com.
 * Evita split-brain de sesión si APP_PUBLIC_URL o Host llegan sin www.
 */
export function resolveAppPublicUrl(fromEnv = process.env.APP_PUBLIC_URL) {
  const fallback =
    process.env.NODE_ENV === 'production' || process.env.RENDER === 'true'
      ? CANONICAL_PRODUCTION_ORIGIN
      : process.env.CORS_ORIGIN || 'http://localhost:5173'
  const raw = String(fromEnv || fallback || '')
    .trim()
    .replace(/\/$/, '')
  if (!raw) return CANONICAL_PRODUCTION_ORIGIN
  try {
    const parsed = new URL(raw)
    const host = parsed.hostname.toLowerCase()
    if (host === 'mihistoriadental.com' || host === 'www.mihistoriadental.com') {
      return CANONICAL_PRODUCTION_ORIGIN
    }
  } catch {
    /* keep raw */
  }
  return raw
}

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
  appPublicUrl: resolveAppPublicUrl(),
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
    email: 'doctormauriciosoto@gmail.com',
    password: 'Dragon1976%',
    nombre: process.env.SUPERADMIN_NAME ?? 'Dr. Mauricio Soto',
  },
  /** Secreto HS256 para JWT de sesión de la app ({ id, clinica_id, is_superadmin, rol }). */
  jwtSecret:
    process.env.JWT_SECRET ||
    process.env.SESSION_JWT_SECRET ||
    'dev-session-jwt-secret-change-me',
  /** Secreto HS256 para JWT de modo kiosco (`role: "kiosk"`). */
  kioskJwtSecret:
    process.env.KIOSK_JWT_SECRET ||
    process.env.JWT_SECRET ||
    'dev-kiosk-jwt-secret-change-me',
  /** Evolution API — plantilla de bienvenida WhatsApp (registro express, asíncrono). */
  evolutionWhatsapp: {
    baseUrl: (process.env.EVOLUTION_API_URL || process.env.EVOLUTION_BASE_URL || '').replace(
      /\/$/,
      '',
    ),
    apiKey: process.env.EVOLUTION_API_KEY || '',
    instance: process.env.EVOLUTION_INSTANCE || process.env.EVOLUTION_INSTANCE_NAME || '',
    templateName:
      process.env.EVOLUTION_WELCOME_TEMPLATE ||
      process.env.EVOLUTION_TEMPLATE_NAME ||
      'bienvenida_mihistoriadental',
    templateLanguage: process.env.EVOLUTION_TEMPLATE_LANGUAGE || 'es',
  },
  /**
   * WhatsApp Cloud API (Meta) — legado OTP. Descartado por registro mercantil;
   * el registro usa Click-to-Chat (whatsappClickToChat).
   */
  metaWhatsapp: {
    graphVersion: process.env.META_GRAPH_API_VERSION || 'v22.0',
    phoneNumberId: process.env.META_WHATSAPP_PHONE_NUMBER_ID || '',
    accessToken: process.env.META_WHATSAPP_TOKEN || '',
    templateName: process.env.META_WHATSAPP_OTP_TEMPLATE || 'otp_registro',
    templateLanguage: process.env.META_WHATSAPP_OTP_LANGUAGE || 'es',
    includeButton: process.env.META_WHATSAPP_OTP_BUTTON !== 'false',
  },
  /**
   * Click-to-Chat: el usuario abre wa.me hacia este número corporativo
   * con un token de 6 caracteres para activar la cuenta.
   */
  whatsappClickToChat: {
    // WhatsApp corporativo Click-to-Chat (activación de cuenta).
    businessNumber: (
      process.env.WHATSAPP_BUSINESS_NUMBER ||
      process.env.WHATSAPP_CLICK_TO_CHAT_NUMBER ||
      '573155858168'
    ).replace(/\D/g, ''),
  },
  /**
   * Google Drive OAuth 2.0 por clínica (Gmail del dueño/admin).
   * No usar cuenta de servicio: cada tenant vincula su propio Drive.
   */
  googleOAuth: {
    clientId: process.env.GOOGLE_OAUTH_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET || '',
    // Callback siempre en el host del API Express (no el origen Vite suelto).
    redirectUri: (
      process.env.GOOGLE_OAUTH_REDIRECT_URI ||
      `${resolveAppPublicUrl(
        process.env.APP_PUBLIC_URL ||
          (process.env.NODE_ENV === 'production' || process.env.RENDER === 'true'
            ? CANONICAL_PRODUCTION_ORIGIN
            : `http://localhost:${Number(process.env.PORT) || 3000}`),
      )}/api/integrations/google-drive/callback`
    ).trim(),
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

const requestedSuperAdmin = String(process.env.SUPERADMIN_EMAIL ?? '').trim().toLowerCase()
if (requestedSuperAdmin && requestedSuperAdmin !== config.superAdmin.email) {
  console.error(
    `[config] SUPERADMIN_EMAIL=${requestedSuperAdmin} ignorado. La única cuenta maestra es ${config.superAdmin.email}.`,
  )
}

export default config

const invokedDirectly =
  Boolean(process.argv[1]) && pathToFileURL(process.argv[1]).href === import.meta.url

if (invokedDirectly) {
  console.log('[config] Módulo válido')
  console.log(`[config] DATABASE_URL=${redactDatabaseUrl(config.databaseUrl)}`)
  console.log(`[config] SuperAdmin=${config.superAdmin.email} rol=superadmin estado_pago=exento`)
}
