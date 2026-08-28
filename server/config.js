import 'dotenv/config'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const port = Number(process.env.PORT ?? 3000)

export const config = {
  port,
  nodeEnv: process.env.NODE_ENV ?? 'development',
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
