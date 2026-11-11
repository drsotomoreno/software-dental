/**
 * OAuth 2.0 Google Drive por clínica (scope drive.file).
 * Solo dueño/admin conecta el Gmail; refresh_token se cifra en reposo.
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import { google } from 'googleapis'
import { config } from '../config.js'
import { clinicSyncAliasIds } from '../../shared/clinicalSyncScope.js'
import { decryptSecret, encryptSecret } from '../utils/tokenEncryption.js'
import {
  clearClinicGoogleDriveConnection,
  ensureClinicGoogleDriveSchema,
  getClinicGoogleDriveRecord,
  getClinicGoogleDriveStatus,
  saveClinicGoogleDriveConnection,
} from './clinicGoogleDriveStore.js'

const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file'
const USERINFO_EMAIL_SCOPE = 'https://www.googleapis.com/auth/userinfo.email'
const SCOPES = [DRIVE_FILE_SCOPE, USERINFO_EMAIL_SCOPE]
const STATE_TTL_MS = 15 * 60 * 1000
const FOLDER_MIME = 'application/vnd.google-apps.folder'

function normalizeRole(rol) {
  const value = String(rol ?? '')
    .trim()
    .toLowerCase()
  if (value === 'administrador' || value === 'admin_clinica') return 'admin'
  return value
}

export function canManageClinicGoogleDrive(user) {
  if (!user || typeof user !== 'object') return false
  const email = String(user.email || '')
    .trim()
    .toLowerCase()
  if (email === 'doctormauriciosoto@gmail.com') return false
  const clinicId = String(user.clinicId || user.id || '').trim()
  if (!clinicId) return false
  const isOwner = String(user.id) === clinicId
  const role = normalizeRole(user.rol)
  return isOwner || role === 'admin'
}

export function canonicalClinicIdOf(user) {
  return clinicSyncAliasIds(user).canonical
}

function clinicDisplayName(user) {
  const name =
    String(user?.clinicName || '').trim() ||
    String(user?.legalName || '').trim() ||
    String(user?.nombre || '').trim() ||
    'Clínica'
  return name.replace(/[\\/]+/g, '-').slice(0, 120)
}

export function rootFolderNameForClinic(clinicName) {
  return `mihistoriadental - ${String(clinicName || 'Clínica').trim() || 'Clínica'}`
}

function oauthConfigured() {
  return Boolean(
    config.googleOAuth?.clientId &&
      config.googleOAuth?.clientSecret &&
      config.googleOAuth?.redirectUri,
  )
}

export function getGoogleOAuthConfigStatus() {
  return {
    configured: oauthConfigured(),
    redirectUri: config.googleOAuth?.redirectUri || null,
    scopes: SCOPES,
  }
}

function createOAuthClient() {
  if (!oauthConfigured()) {
    const err = new Error(
      'Google OAuth no está configurado. Defina GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET y GOOGLE_OAUTH_REDIRECT_URI.',
    )
    err.code = 'GOOGLE_OAUTH_NOT_CONFIGURED'
    throw err
  }
  return new google.auth.OAuth2(
    config.googleOAuth.clientId,
    config.googleOAuth.clientSecret,
    config.googleOAuth.redirectUri,
  )
}

function stateSigningKey() {
  return String(
    process.env.GOOGLE_TOKEN_ENCRYPTION_KEY ||
      config.jwtSecret ||
      'dev-google-oauth-state-key',
  )
}

function signStatePayload(payload) {
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
  const sig = createHmac('sha256', stateSigningKey()).update(body).digest('base64url')
  return `${body}.${sig}`
}

function verifyStateToken(state) {
  const raw = String(state || '')
  const dot = raw.lastIndexOf('.')
  if (dot <= 0) {
    const err = new Error('State OAuth inválido.')
    err.code = 'INVALID_OAUTH_STATE'
    throw err
  }
  const body = raw.slice(0, dot)
  const sig = raw.slice(dot + 1)
  const expected = createHmac('sha256', stateSigningKey()).update(body).digest('base64url')
  const left = Buffer.from(sig)
  const right = Buffer.from(expected)
  if (left.length !== right.length || !timingSafeEqual(left, right)) {
    const err = new Error('State OAuth alterado o inválido.')
    err.code = 'INVALID_OAUTH_STATE'
    throw err
  }
  let payload
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
  } catch {
    const err = new Error('State OAuth corrupto.')
    err.code = 'INVALID_OAUTH_STATE'
    throw err
  }
  if (!payload?.exp || Date.now() > Number(payload.exp)) {
    const err = new Error('State OAuth expirado. Vuelva a conectar Google Drive.')
    err.code = 'OAUTH_STATE_EXPIRED'
    throw err
  }
  return payload
}

/**
 * Genera la URL de consentimiento de Google (offline + consent + drive.file).
 */
export function buildGoogleDriveConnectUrl(user) {
  if (!canManageClinicGoogleDrive(user)) {
    const err = new Error('Solo el dueño o un administrador de la clínica puede conectar Google Drive.')
    err.code = 'FORBIDDEN_DRIVE_CONNECT'
    err.status = 403
    throw err
  }
  const clinicId = canonicalClinicIdOf(user)
  if (!clinicId) {
    const err = new Error('La sesión no tiene clínica canónica asociada.')
    err.code = 'MISSING_CLINIC'
    err.status = 400
    throw err
  }

  const client = createOAuthClient()
  const state = signStatePayload({
    clinicId,
    userId: String(user.id),
    clinicName: clinicDisplayName(user),
    exp: Date.now() + STATE_TTL_MS,
  })

  const url = client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: true,
    scope: SCOPES,
    state,
  })

  return { url, clinicId, state }
}

async function findExistingRootFolder(drive, folderName) {
  const escaped = String(folderName).replace(/\\/g, '\\\\').replace(/'/g, "\\'")
  const q = [
    `name = '${escaped}'`,
    `mimeType = '${FOLDER_MIME}'`,
    `'root' in parents`,
    'trashed = false',
  ].join(' and ')
  const res = await drive.files.list({
    q,
    spaces: 'drive',
    fields: 'files(id, name)',
    pageSize: 5,
  })
  const files = Array.isArray(res.data?.files) ? res.data.files : []
  return files[0]?.id || null
}

async function ensureRootFolder(authClient, clinicName) {
  const drive = google.drive({ version: 'v3', auth: authClient })
  const name = rootFolderNameForClinic(clinicName)
  const existingId = await findExistingRootFolder(drive, name)
  if (existingId) return { id: existingId, name, created: false }

  const created = await drive.files.create({
    requestBody: {
      name,
      mimeType: FOLDER_MIME,
      parents: ['root'],
    },
    fields: 'id, name',
  })
  const id = created.data?.id
  if (!id) {
    const err = new Error('Google Drive no devolvió el ID de la carpeta raíz.')
    err.code = 'DRIVE_FOLDER_CREATE_FAILED'
    throw err
  }
  return { id, name, created: true }
}

async function fetchGoogleAccountEmail(authClient) {
  const oauth2 = google.oauth2({ version: 'v2', auth: authClient })
  const me = await oauth2.userinfo.get()
  const email = String(me.data?.email || '')
    .trim()
    .toLowerCase()
  if (!email) {
    const err = new Error('No se pudo leer el Gmail de la cuenta de Google.')
    err.code = 'GOOGLE_EMAIL_MISSING'
    throw err
  }
  return email
}

/**
 * Callback: code → tokens → carpeta → persistencia cifrada.
 */
export async function completeGoogleDriveOAuthCallback({ code, state }) {
  const payload = verifyStateToken(state)
  const clinicId = String(payload.clinicId || '').trim()
  const clinicName = String(payload.clinicName || 'Clínica').trim() || 'Clínica'
  const userId = String(payload.userId || '').trim()
  if (!clinicId || !code) {
    const err = new Error('Callback OAuth incompleto.')
    err.code = 'OAUTH_CALLBACK_INVALID'
    err.status = 400
    throw err
  }

  await ensureClinicGoogleDriveSchema().catch(() => undefined)

  const client = createOAuthClient()
  const { tokens } = await client.getToken(String(code))
  if (!tokens?.refresh_token && !tokens?.access_token) {
    const err = new Error('Google no devolvió tokens. Revoke el acceso de la app y vuelva a conectar con prompt=consent.')
    err.code = 'GOOGLE_TOKENS_MISSING'
    err.status = 400
    throw err
  }

  client.setCredentials(tokens)

  let refreshToken = tokens.refresh_token || null
  if (!refreshToken) {
    const existing = await getClinicGoogleDriveRecord(clinicId)
    if (existing?.refreshTokenEnc) {
      try {
        refreshToken = decryptSecret(existing.refreshTokenEnc)
      } catch {
        refreshToken = null
      }
    }
  }
  if (!refreshToken) {
    const err = new Error(
      'Google no envió refresh_token. En https://myaccount.google.com/permissions quite el acceso a mihistoriadental y vuelva a conectar.',
    )
    err.code = 'GOOGLE_REFRESH_TOKEN_MISSING'
    err.status = 400
    throw err
  }

  const googleDriveEmail = await fetchGoogleAccountEmail(client)
  const folder = await ensureRootFolder(client, clinicName)
  const connectedAt = new Date().toISOString()
  const tokenExpiresAt = tokens.expiry_date
    ? new Date(Number(tokens.expiry_date)).toISOString()
    : null

  const status = await saveClinicGoogleDriveConnection(clinicId, {
    status: 'connected',
    googleDriveEmail,
    refreshTokenEnc: encryptSecret(refreshToken),
    accessTokenEnc: tokens.access_token ? encryptSecret(tokens.access_token) : null,
    tokenExpiresAt,
    rootFolderId: folder.id,
    clinicName,
    connectedAt,
    connectedByUserId: userId,
    rootFolderName: folder.name,
  })

  return {
    ...status,
    clinicId,
    folderCreated: folder.created,
  }
}

export async function readGoogleDriveStatusForUser(user) {
  const clinicId = canonicalClinicIdOf(user)
  const oauth = getGoogleOAuthConfigStatus()
  if (!clinicId) {
    return {
      success: true,
      clinicId: null,
      canManage: false,
      oauthConfigured: oauth.configured,
      connected: false,
      status: 'disconnected',
      googleDriveEmail: null,
      rootFolderId: null,
    }
  }
  const row = await getClinicGoogleDriveStatus(clinicId)
  return {
    success: true,
    clinicId,
    canManage: canManageClinicGoogleDrive(user),
    oauthConfigured: oauth.configured,
    ...row,
  }
}

export async function disconnectGoogleDriveForUser(user) {
  if (!canManageClinicGoogleDrive(user)) {
    const err = new Error('Solo el dueño o un administrador puede desconectar Google Drive.')
    err.code = 'FORBIDDEN_DRIVE_DISCONNECT'
    err.status = 403
    throw err
  }
  const clinicId = canonicalClinicIdOf(user)
  const status = await clearClinicGoogleDriveConnection(clinicId)
  return { ...status, clinicId }
}

/**
 * Cliente autenticado para la clínica (usa refresh_token cifrado).
 * Fase 2+ (upload/download de adjuntos).
 */
export async function getAuthorizedDriveClient(canonicalClinicId) {
  const record = await getClinicGoogleDriveRecord(canonicalClinicId)
  if (!record?.refreshTokenEnc || record.status !== 'connected') {
    const err = new Error(
      'La clínica no tiene Google Drive conectado. El dueño/admin debe vincular el Gmail antes de subir adjuntos.',
    )
    err.code = 'DRIVE_NOT_CONNECTED'
    err.status = 409
    throw err
  }
  const refreshToken = decryptSecret(record.refreshTokenEnc)
  const client = createOAuthClient()
  client.setCredentials({
    refresh_token: refreshToken,
    access_token: record.accessTokenEnc ? decryptSecret(record.accessTokenEnc) : undefined,
    expiry_date: record.tokenExpiresAt ? Date.parse(record.tokenExpiresAt) : undefined,
  })
  client.on('tokens', async (tokens) => {
    try {
      const patch = {}
      if (tokens.access_token) patch.accessTokenEnc = encryptSecret(tokens.access_token)
      if (tokens.expiry_date) patch.tokenExpiresAt = new Date(Number(tokens.expiry_date)).toISOString()
      if (tokens.refresh_token) patch.refreshTokenEnc = encryptSecret(tokens.refresh_token)
      if (Object.keys(patch).length) {
        await saveClinicGoogleDriveConnection(canonicalClinicId, {
          ...record,
          ...patch,
          status: 'connected',
        })
      }
    } catch (error) {
      console.warn(
        '[google-drive] No se pudo persistir tokens rotados:',
        error instanceof Error ? error.message : error,
      )
    }
  })
  return {
    auth: client,
    drive: google.drive({ version: 'v3', auth: client }),
    rootFolderId: record.rootFolderId,
    googleDriveEmail: record.googleDriveEmail,
  }
}

export function frontendRedirectAfterOAuth({ ok, errorCode }) {
  const base = String(config.appPublicUrl || '').replace(/\/$/, '') || 'http://localhost:5173'
  const url = new URL(`${base}/perfil`)
  if (ok) {
    url.searchParams.set('googleDrive', 'connected')
  } else {
    url.searchParams.set('googleDrive', 'error')
    if (errorCode) url.searchParams.set('code', String(errorCode))
  }
  return url.toString()
}
