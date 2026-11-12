/**
 * Clave AES (32 bytes) solo en RAM / sessionStorage de pestaña.
 * Nunca se persiste en localStorage permanente (Habeas Data / Ley 1581).
 *
 * - Login: se deriva del JWT de sesión + userId + clinicId.
 * - Mientras la pestaña viva, la DEK queda en sessionStorage para no
 *   rotar el sello de dexie-encrypted si el JWT se refresca.
 * - Logout: limpia RAM y sessionStorage → IndexedDB cifrado queda ilegible
 *   sin volver a autenticarse.
 */

const VAULT_SESSION_KEY = 'mhd_dexie_vault_v1'
const VAULT_OWNER_KEY = 'mhd_dexie_vault_owner_v1'
const PEPPER = 'mihistoriadental-local-vault-v1'

let ramKey: Uint8Array | null = null
let ramOwner: string | null = null
let unlockWaiters: Array<(key: Uint8Array) => void> = []

function vaultOwnerId(userId: string, clinicId: string): string {
  return `${String(userId || '').trim()}::${String(clinicId || '').trim()}`
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]!)
  return btoa(binary)
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i)
  return out
}

async function sha256Bytes(material: string): Promise<Uint8Array> {
  const data = new TextEncoder().encode(material)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return new Uint8Array(digest)
}

function readSessionVaultKey(owner: string): Uint8Array | null {
  try {
    const storedOwner = sessionStorage.getItem(VAULT_OWNER_KEY)
    if (storedOwner !== owner) return null
    const raw = sessionStorage.getItem(VAULT_SESSION_KEY)
    if (!raw) return null
    const bytes = base64ToBytes(raw)
    return bytes.length === 32 ? bytes : null
  } catch {
    return null
  }
}

function writeSessionVaultKey(key: Uint8Array, owner: string): void {
  try {
    sessionStorage.setItem(VAULT_SESSION_KEY, bytesToBase64(key))
    sessionStorage.setItem(VAULT_OWNER_KEY, owner)
  } catch {
    // sessionStorage bloqueado (modo privado estricto): solo RAM.
  }
}

function publishKey(key: Uint8Array, owner: string): void {
  ramKey = key
  ramOwner = owner
  writeSessionVaultKey(key, owner)
  const waiters = unlockWaiters
  unlockWaiters = []
  for (const resolve of waiters) resolve(key)
}

/** Desbloquea el vault local a partir del JWT (o PIN de clínica). */
export async function unlockLocalEncryption(options: {
  secret: string
  userId: string
  clinicId: string
}): Promise<Uint8Array> {
  const owner = vaultOwnerId(options.userId, options.clinicId)
  if (ramKey && ramOwner === owner) return ramKey
  const existing = readSessionVaultKey(owner)
  if (existing) {
    ramKey = existing
    ramOwner = owner
    return existing
  }
  // Primera apertura de la pestaña: el JWT entra al material. Luego la DEK
  // vive en sessionStorage para no rotar al refrescar el token.
  const material = [PEPPER, owner, String(options.secret || '').trim()].join('|')
  const key = await sha256Bytes(material)
  publishKey(key, owner)
  return key
}

/** Hidrata desde JWT en memoria de sesión al recargar la pestaña. */
export async function hydrateLocalEncryptionFromAuth(auth: {
  token: string
  user: { id?: string; clinicId?: string; email?: string }
} | null): Promise<void> {
  if (!auth?.token || !auth.user?.id) {
    return
  }
  const { resolveClinicSyncId } = await import('../../shared/clinicalSyncScope.js')
  const clinicId =
    resolveClinicSyncId(auth.user) || String(auth.user.clinicId || auth.user.id || '')
  await unlockLocalEncryption({
    secret: auth.token,
    userId: String(auth.user.id),
    clinicId,
  })
}

/** Cierra el vault: sin autenticación la IDB cifrada no se puede leer. */
export function lockLocalEncryption(): void {
  ramKey = null
  ramOwner = null
  try {
    sessionStorage.removeItem(VAULT_SESSION_KEY)
    sessionStorage.removeItem(VAULT_OWNER_KEY)
  } catch {
    /* ignore */
  }
}

/**
 * Promise estable para dexie-encrypted.
 * Si aún no hay sesión, espera el unlock (o usa placeholder anónimo).
 */
export function getLocalEncryptionKeyPromise(dbName?: string): Promise<Uint8Array> {
  if (ramKey) return Promise.resolve(ramKey)
  try {
    const owner = sessionStorage.getItem(VAULT_OWNER_KEY)
    if (owner) {
      const cached = readSessionVaultKey(owner)
      if (cached) {
        ramKey = cached
        ramOwner = owner
        return Promise.resolve(cached)
      }
    }
  } catch {
    /* ignore */
  }

  const isAnon =
    !dbName ||
    dbName.includes('_anon_') ||
    dbName.endsWith('_none') ||
    /(^|_)anon(_|$)/i.test(dbName)

  if (isAnon) {
    return sha256Bytes(`${PEPPER}|anon-placeholder`)
  }

  return new Promise<Uint8Array>((resolve) => {
    unlockWaiters.push(resolve)
  })
}

export function hasLocalEncryptionKey(): boolean {
  if (ramKey) return true
  try {
    const owner = sessionStorage.getItem(VAULT_OWNER_KEY)
    return Boolean(owner && readSessionVaultKey(owner))
  } catch {
    return false
  }
}
