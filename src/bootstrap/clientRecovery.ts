/**
 * Recuperación de cliente: evita pantalla en blanco tras deploy
 * (chunks viejos, SW/caché obsoleto, Dexie desfasada).
 *
 * APP_BUILD_VERSION ≠ SYNC_SCHEMA_VERSION:
 * - Época de sync: invalida caché de pull y conserva Dexie clínico.
 * - Build de app: purga CacheStorage/SW/IndexedDB y fuerza rehidratación limpia
 *   conservando solo el token de autenticación.
 */

/**
 * Versión de build inyectada por Vite (`define.__APP_BUILD_VERSION__`).
 * Fallback solo para tests / entornos sin define.
 */
export const APP_BUILD_VERSION =
  typeof __APP_BUILD_VERSION__ !== 'undefined' && String(__APP_BUILD_VERSION__ || '').trim()
    ? String(__APP_BUILD_VERSION__).trim()
    : '2026-11-25-v2'

export const MHD_BUILD_VERSION_KEY = 'mhd_build_version'
const BUILD_RELOAD_SESSION_KEY = 'mhd_build_reload_once'
const CHUNK_RELOAD_SESSION_KEY = 'mhd_chunk_reload_once'
const ERROR_RECOVERY_SESSION_KEY = 'mhd_error_recovery_once'

/** Claves de sesión API que NUNCA se borran en una purga de build/error. */
const AUTH_PRESERVE_KEYS = [
  'doctorSEO_token',
  'doctorSEO_user',
  'doctorSEO_rol',
  'doctorseolabs_api_token',
  'doctorseolabs_api_user',
] as const

function safeSessionGet(key: string): string {
  try {
    return String(sessionStorage.getItem(key) || '')
  } catch {
    return ''
  }
}

function safeSessionSet(key: string, value: string): void {
  try {
    sessionStorage.setItem(key, value)
  } catch {
    /* ignore */
  }
}

function safeSessionRemove(key: string): void {
  try {
    sessionStorage.removeItem(key)
  } catch {
    /* ignore */
  }
}

export async function clearBrowserCacheStorage(): Promise<void> {
  if (typeof caches === 'undefined') return
  try {
    const keys = await caches.keys()
    await Promise.all(keys.map((key) => caches.delete(key).catch(() => false)))
  } catch (error) {
    console.warn('[clientRecovery] No se pudieron limpiar CacheStorage:', error)
  }
}

export async function unregisterServiceWorkers(): Promise<void> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
  try {
    const registrations = await navigator.serviceWorker.getRegistrations()
    await Promise.all(registrations.map((reg) => reg.unregister().catch(() => false)))
  } catch (error) {
    console.warn('[clientRecovery] No se pudieron desregistrar Service Workers:', error)
  }
}

function deleteIndexedDbByName(name: string): Promise<void> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.deleteDatabase(name)
      req.onsuccess = () => resolve()
      req.onerror = () => resolve()
      req.onblocked = () => resolve()
    } catch {
      resolve()
    }
  })
}

/**
 * Borra bases IndexedDB (Dexie clínico, pull cache, espejos).
 * No toca localStorage de autenticación.
 */
export async function clearLocalIndexedDatabases(): Promise<void> {
  if (typeof indexedDB === 'undefined') return

  const names = new Set<string>(['ClinicSyncPullCache', 'ClinicSyncPullCache_v2'])

  try {
    if (typeof indexedDB.databases === 'function') {
      const listed = await indexedDB.databases()
      for (const entry of listed) {
        const name = String(entry?.name || '').trim()
        if (name) names.add(name)
      }
    }
  } catch (error) {
    console.warn('[clientRecovery] indexedDB.databases() no disponible:', error)
  }

  // Prefijos conocidos por si databases() no lista (Safari viejo / private).
  for (const prefix of ['DentalEMR', 'DentalEMR_canonical', 'doctorSEO', 'mihistoriadental']) {
    for (const name of Array.from(names)) {
      if (name.startsWith(prefix)) names.add(name)
    }
  }

  await Promise.all(Array.from(names).map((name) => deleteIndexedDbByName(name)))
}

/** Invalida marcas de pull para forzar rehidratación desde /api/sync. */
export function clearSyncMarkersPreserveAuth(): void {
  if (typeof localStorage === 'undefined') return
  try {
    const preserve = new Set<string>(AUTH_PRESERVE_KEYS)
    preserve.add(MHD_BUILD_VERSION_KEY)

    const toRemove: string[] = []
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i)
      if (!key || preserve.has(key)) continue
      if (
        /lastSyncAt|LastSync|pullCache|clinicPull|mhd_sync_epoch|syncSchema|clinical_sync_health|__doctorSEO/i.test(
          key,
        )
      ) {
        toRemove.push(key)
      }
    }
    for (const key of toRemove) localStorage.removeItem(key)
  } catch {
    /* ignore */
  }

  // La salud del pull vive en sessionStorage; si queda en "ok" con Dexie vacío,
  // Pacientes Activos muestra "no hay pacientes" en falso.
  try {
    sessionStorage.removeItem('mhd_clinical_sync_health')
  } catch {
    /* ignore */
  }
}

/**
 * Purga completa de caché local (CacheStorage + SW + IndexedDB + marcas de sync).
 * Conserva el token/usuario de autenticación.
 */
export async function purgeStaleClientState(reason = 'manual'): Promise<void> {
  console.warn('[clientRecovery] Purga de estado local:', reason)
  await clearBrowserCacheStorage()
  await unregisterServiceWorkers()
  await clearLocalIndexedDatabases()
  clearSyncMarkersPreserveAuth()
}

/**
 * Cierre de sesión en PC compartido (recepción): limpia auth + Dexie + sync.
 * Conserva solo `mhd_build_version` para no disparar otro purge de build al volver.
 */
export async function purgeClientStateOnLogout(): Promise<void> {
  console.warn('[clientRecovery] Purga por cierre de sesión')

  try {
    const { deleteAndResetDentalDatabase } = await import('@/db/database')
    await deleteAndResetDentalDatabase()
  } catch (error) {
    console.warn('[clientRecovery] deleteAndResetDentalDatabase falló:', error)
  }

  await clearLocalIndexedDatabases()

  try {
    const keep = new Set<string>([MHD_BUILD_VERSION_KEY])
    const toRemove: string[] = []
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i)
      if (!key || keep.has(key)) continue
      toRemove.push(key)
    }
    for (const key of toRemove) localStorage.removeItem(key)
  } catch {
    /* ignore */
  }

  try {
    sessionStorage.clear()
  } catch {
    /* ignore */
  }
}

/**
 * Compara APP_BUILD_VERSION con localStorage. Si no coinciden, purga y recarga
 * una sola vez por sesión (anti-bucle).
 * @returns true si se disparó reload (no montar React todavía).
 */
export async function ensureAppBuildVersion(): Promise<boolean> {
  if (typeof window === 'undefined') return false

  let stored = ''
  try {
    stored = String(localStorage.getItem(MHD_BUILD_VERSION_KEY) || '').trim()
  } catch {
    stored = ''
  }

  if (stored === APP_BUILD_VERSION) {
    safeSessionRemove(BUILD_RELOAD_SESSION_KEY)
    return false
  }

  const alreadyReloaded = safeSessionGet(BUILD_RELOAD_SESSION_KEY) === APP_BUILD_VERSION

  try {
    await purgeStaleClientState(`build-mismatch:${stored || '(none)'}→${APP_BUILD_VERSION}`)
  } catch (error) {
    console.warn('[clientRecovery] Purga por build falló (se continúa):', error)
  }

  try {
    localStorage.setItem(MHD_BUILD_VERSION_KEY, APP_BUILD_VERSION)
  } catch {
    /* ignore */
  }

  if (alreadyReloaded) {
    console.warn(
      '[clientRecovery] Build ya intentó reload en esta sesión; se monta React sin segundo reload.',
    )
    return false
  }

  safeSessionSet(BUILD_RELOAD_SESSION_KEY, APP_BUILD_VERSION)
  window.location.reload()
  return true
}

function isChunkLoadFailure(reason: unknown): boolean {
  const message = String(
    (reason as { message?: string })?.message ||
      (reason as { name?: string })?.name ||
      reason ||
      '',
  )
  return (
    /ChunkLoadError|Loading chunk [\d]+ failed|Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(
      message,
    )
  )
}

/** Máximo 1 reload automático por sesión ante chunks desactualizados. */
export function installChunkLoadRecovery(): void {
  if (typeof window === 'undefined') return

  const reloadOnce = (source: string) => {
    if (safeSessionGet(CHUNK_RELOAD_SESSION_KEY) === '1') {
      console.warn(`[clientRecovery] ${source}: ya se recargó por chunk en esta sesión.`)
      return
    }
    safeSessionSet(CHUNK_RELOAD_SESSION_KEY, '1')
    console.warn(`[clientRecovery] ${source}: forzando reload por módulo desactualizado.`)
    window.location.reload()
  }

  window.addEventListener('vite:preloadError', (event) => {
    try {
      event.preventDefault()
    } catch {
      /* ignore */
    }
    reloadOnce('vite:preloadError')
  })

  window.addEventListener('unhandledrejection', (event) => {
    if (!isChunkLoadFailure(event.reason)) return
    try {
      event.preventDefault()
    } catch {
      /* ignore */
    }
    reloadOnce('unhandledrejection:ChunkLoadError')
  })
}

export function canAttemptSilentErrorRecovery(): boolean {
  return safeSessionGet(ERROR_RECOVERY_SESSION_KEY) !== '1'
}

export function markSilentErrorRecoveryAttempted(): void {
  safeSessionSet(ERROR_RECOVERY_SESSION_KEY, '1')
}

export async function recoverFromRuntimeErrorAndReload(): Promise<void> {
  markSilentErrorRecoveryAttempted()
  try {
    await purgeStaleClientState('runtime-error-recovery')
  } catch {
    /* ignore */
  }
  try {
    localStorage.setItem(MHD_BUILD_VERSION_KEY, APP_BUILD_VERSION)
  } catch {
    /* ignore */
  }
  window.location.reload()
}
