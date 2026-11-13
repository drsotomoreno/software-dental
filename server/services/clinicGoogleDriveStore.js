/**
 * Persistencia OAuth Google Drive por clinicId canónico (`clinic:{tenantId}`).
 * Fuente operativa: durable JSON + tabla clinica_google_drive (Postgres).
 * Espejo best-effort en clinicas.* cuando existe clinic_canonical_id.
 */
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { config } from '../config.js'
import { splitSqlStatements } from './consultasRepository.js'
import {
  readDurableJsonWithMerge,
  withPgClient,
  withPgClientInteractive,
  writeDurableJsonWithMerge,
} from './durableStore.js'
import {
  getGoogleDriveCredentialCache,
  listCachedConnectedDriveRecords,
  putGoogleDriveCredentialCache,
  clearGoogleDriveCredentialCache,
} from './googleDriveCredentialCache.js'

const STORE_FILE = join(config.dataDir, 'clinic-google-drive.json')
const STORE_KEY = 'clinic-google-drive'

const MIGRATION_FILE = join(
  dirname(fileURLToPath(import.meta.url)),
  '../db/migrations/20261111150000_clinicas_google_drive.sql',
)

let schemaReady = null
let writeChain = Promise.resolve()

function emptyStore() {
  return { clinics: {} }
}

function enqueueWrite(fn) {
  const next = writeChain.then(fn, fn)
  writeChain = next.then(
    () => undefined,
    () => undefined,
  )
  return next
}

export function mergeClinicGoogleDriveStores(left, right) {
  const a = left && typeof left === 'object' ? left : emptyStore()
  const b = right && typeof right === 'object' ? right : emptyStore()
  const clinics = {
    ...(a.clinics && typeof a.clinics === 'object' ? a.clinics : {}),
    ...(b.clinics && typeof b.clinics === 'object' ? b.clinics : {}),
  }
  for (const [clinicId, rowA] of Object.entries(
    a.clinics && typeof a.clinics === 'object' ? a.clinics : {},
  )) {
    const rowB = b.clinics?.[clinicId]
    if (!rowB) continue
    const stampA = Date.parse(String(rowA?.updatedAt || rowA?.connectedAt || 0)) || 0
    const stampB = Date.parse(String(rowB?.updatedAt || rowB?.connectedAt || 0)) || 0
    clinics[clinicId] = stampB >= stampA ? { ...rowA, ...rowB } : { ...rowB, ...rowA }
  }
  return { clinics }
}

export async function ensureClinicGoogleDriveSchema() {
  if (!schemaReady) {
    schemaReady = withPgClient(async (client) => {
      const sql = await readFile(MIGRATION_FILE, 'utf8')
      for (const statement of splitSqlStatements(sql)) {
        await client.query(statement)
      }
    }).catch((error) => {
      schemaReady = null
      throw error
    })
  }
  return schemaReady
}

async function loadStore() {
  return mergeClinicGoogleDriveStores(
    emptyStore(),
    await readDurableJsonWithMerge(STORE_FILE, emptyStore(), STORE_KEY, mergeClinicGoogleDriveStores),
  )
}

async function saveStore(store) {
  await writeDurableJsonWithMerge(STORE_FILE, store, STORE_KEY, mergeClinicGoogleDriveStores)
}

function publicRow(row) {
  if (!row) {
    return {
      connected: false,
      status: 'disconnected',
      googleDriveEmail: null,
      rootFolderId: null,
      clinicName: null,
      connectedAt: null,
    }
  }
  const status = String(row.status || 'disconnected')
  const connected = status === 'connected' && Boolean(row.refreshTokenEnc && row.rootFolderId)
  return {
    connected,
    status,
    googleDriveEmail: row.googleDriveEmail || null,
    rootFolderId: row.rootFolderId || null,
    clinicName: row.clinicName || null,
    connectedAt: row.connectedAt || null,
  }
}

async function upsertPostgres(canonicalClinicId, row) {
  try {
    await ensureClinicGoogleDriveSchema()
    await withPgClientInteractive(async (client) => {
      await client.query(
        `INSERT INTO clinica_google_drive (
           clinic_canonical_id,
           google_drive_email,
           google_drive_refresh_token,
           google_drive_root_folder_id,
           google_drive_access_token,
           google_drive_token_expires_at,
           google_drive_connected_at,
           google_drive_status,
           clinic_name,
           connected_by_user_id,
           updated_at
         ) VALUES (
           $1::text, $2::text, $3::text, $4::text, $5::text,
           $6::timestamptz, $7::timestamptz, $8::text, $9::text, $10::text, now()
         )
         ON CONFLICT (clinic_canonical_id) DO UPDATE SET
           google_drive_email = EXCLUDED.google_drive_email,
           google_drive_refresh_token = EXCLUDED.google_drive_refresh_token,
           google_drive_root_folder_id = EXCLUDED.google_drive_root_folder_id,
           google_drive_access_token = EXCLUDED.google_drive_access_token,
           google_drive_token_expires_at = EXCLUDED.google_drive_token_expires_at,
           google_drive_connected_at = EXCLUDED.google_drive_connected_at,
           google_drive_status = EXCLUDED.google_drive_status,
           clinic_name = EXCLUDED.clinic_name,
           connected_by_user_id = EXCLUDED.connected_by_user_id,
           updated_at = now()`,
        [
          canonicalClinicId,
          row.googleDriveEmail || null,
          row.refreshTokenEnc || null,
          row.rootFolderId || null,
          row.accessTokenEnc || null,
          row.tokenExpiresAt || null,
          row.connectedAt || null,
          row.status || 'disconnected',
          row.clinicName || null,
          row.connectedByUserId || null,
        ],
      )

      await client.query(
        `UPDATE clinicas
         SET google_drive_email = $2::text,
             google_drive_refresh_token = $3::text,
             google_drive_root_folder_id = $4::text,
             google_drive_connected_at = $5::timestamptz,
             google_drive_status = $6::text,
             clinic_canonical_id = COALESCE(clinic_canonical_id, $1::text)
         WHERE clinic_canonical_id = $1::text
            OR id::text = $7::text`,
        [
          canonicalClinicId,
          row.googleDriveEmail || null,
          row.refreshTokenEnc || null,
          row.rootFolderId || null,
          row.connectedAt || null,
          row.status || 'disconnected',
          canonicalClinicId.replace(/^clinic:/, ''),
        ],
      )
    })
  } catch (error) {
    console.warn(
      '[google-drive] No se pudo espejar en Postgres (se conserva durable JSON):',
      error instanceof Error ? error.message : error,
    )
  }
}

export function clinicIdLookupKeys(canonicalClinicId) {
  const id = String(canonicalClinicId || '').trim()
  if (!id) return []
  const keys = [id]
  if (id.startsWith('clinic:')) keys.push(id.slice('clinic:'.length))
  else keys.push(`clinic:${id}`)
  return [...new Set(keys.filter(Boolean))]
}

function recordFromPostgresRow(row) {
  if (!row) return null
  return {
    clinicId: String(row.clinic_canonical_id || '').trim(),
    status: String(row.google_drive_status || 'disconnected'),
    googleDriveEmail: row.google_drive_email || null,
    refreshTokenEnc: row.google_drive_refresh_token || null,
    accessTokenEnc: row.google_drive_access_token || null,
    tokenExpiresAt: row.google_drive_token_expires_at
      ? new Date(row.google_drive_token_expires_at).toISOString()
      : null,
    rootFolderId: row.google_drive_root_folder_id || null,
    clinicName: row.clinic_name || null,
    connectedAt: row.google_drive_connected_at
      ? new Date(row.google_drive_connected_at).toISOString()
      : null,
    connectedByUserId: row.connected_by_user_id || null,
  }
}

function isConnectedDriveRecord(record) {
  return (
    Boolean(record) &&
    String(record.status || '') === 'connected' &&
    Boolean(record.refreshTokenEnc && record.rootFolderId)
  )
}

/**
 * Busca la primera fila entre varias claves candidatas
 * (JSON durable + Postgres `clinic_canonical_id IN (...)`).
 * @returns {{ record: object, storageKey: string } | null}
 */
export async function findClinicGoogleDriveRecordAmong(candidateIds = []) {
  const store = await loadStore()
  const tried = new Set()
  const keys = []
  for (const raw of candidateIds) {
    for (const key of clinicIdLookupKeys(raw)) {
      if (!key || tried.has(key)) continue
      tried.add(key)
      keys.push(key)
      const row = store.clinics[key]
      if (row) {
        if (isConnectedDriveRecord(row)) {
          void putGoogleDriveCredentialCache(key, row)
        }
        return { record: row, storageKey: key }
      }
    }
  }

  if (keys.length) {
    try {
      // Interactivo: nunca bloqueado por enfriamiento de Postgres.
      const pgHit = await withPgClientInteractive(async (client) => {
        const { rows } = await client.query(
          `SELECT clinic_canonical_id,
                  google_drive_email,
                  google_drive_refresh_token,
                  google_drive_root_folder_id,
                  google_drive_access_token,
                  google_drive_token_expires_at,
                  google_drive_connected_at,
                  google_drive_status,
                  clinic_name,
                  connected_by_user_id
             FROM clinica_google_drive
            WHERE clinic_canonical_id = ANY($1::text[])
            ORDER BY CASE
              WHEN google_drive_status = 'connected'
               AND google_drive_refresh_token IS NOT NULL
               AND btrim(google_drive_refresh_token) <> ''
              THEN 0 ELSE 1 END,
              updated_at DESC NULLS LAST
            LIMIT 1`,
          [keys],
        )
        return rows[0] || null
      })
      const mapped = recordFromPostgresRow(pgHit)
      if (mapped?.clinicId) {
        store.clinics[mapped.clinicId] = {
          ...(store.clinics[mapped.clinicId] || {}),
          ...mapped,
          updatedAt: new Date().toISOString(),
        }
        await saveStore(store).catch(() => undefined)
        if (isConnectedDriveRecord(mapped)) {
          await putGoogleDriveCredentialCache(mapped.clinicId, mapped)
        }
        return { record: mapped, storageKey: mapped.clinicId }
      }
    } catch (error) {
      console.warn(
        '[google-drive] Lookup Postgres clinica_google_drive falló; usando caché:',
        error instanceof Error ? error.message : error,
      )
      const cached = await getGoogleDriveCredentialCache(keys)
      if (cached?.record) return cached
    }
  }

  const cached = await getGoogleDriveCredentialCache(candidateIds)
  if (cached?.record) return cached
  return null
}

/**
 * Respaldo: única fila conectada (o la del superadmin) cuando no hay match exacto.
 * Evita "Google Drive no está conectado" si la clave local ≠ clinic_canonical_id en RDS.
 */
export async function findSoleConnectedGoogleDriveRecord({ allowFallback = false } = {}) {
  if (!allowFallback) return null

  const store = await loadStore()
  const connectedLocal = Object.entries(store.clinics || {})
    .filter(([, row]) => isConnectedDriveRecord(row))
    .map(([key, row]) => ({ record: row, storageKey: key }))

  if (connectedLocal.length === 1) return connectedLocal[0]

  try {
    const pgRows = await withPgClientInteractive(async (client) => {
      const { rows } = await client.query(
        `SELECT clinic_canonical_id,
                google_drive_email,
                google_drive_refresh_token,
                google_drive_root_folder_id,
                google_drive_access_token,
                google_drive_token_expires_at,
                google_drive_connected_at,
                google_drive_status,
                clinic_name,
                connected_by_user_id
           FROM clinica_google_drive
          WHERE google_drive_refresh_token IS NOT NULL
            AND btrim(google_drive_refresh_token) <> ''
            AND google_drive_status = 'connected'
          ORDER BY updated_at DESC NULLS LAST
          LIMIT 2`,
      )
      return rows
    })
    if (Array.isArray(pgRows) && pgRows.length === 1) {
      const mapped = recordFromPostgresRow(pgRows[0])
      if (mapped?.clinicId) {
        await putGoogleDriveCredentialCache(mapped.clinicId, mapped)
        return { record: mapped, storageKey: mapped.clinicId }
      }
    }
  } catch (error) {
    console.warn(
      '[google-drive] Fallback Postgres clinica_google_drive falló; usando caché:',
      error instanceof Error ? error.message : error,
    )
    const cachedList = await listCachedConnectedDriveRecords()
    if (cachedList.length === 1) return cachedList[0]
  }

  if (connectedLocal.length === 1) return connectedLocal[0]
  const cachedList = await listCachedConnectedDriveRecords()
  if (cachedList.length === 1) return cachedList[0]
  return null
}

/** Estado público (sin tokens). Prueba variantes clinic:/bare. */
export async function getClinicGoogleDriveStatus(canonicalClinicId) {
  const found = await findClinicGoogleDriveRecordAmong([canonicalClinicId])
  return publicRow(found?.record || null)
}

/** Fila interna con ciphertext (solo servicios de servidor). */
export async function getClinicGoogleDriveRecord(canonicalClinicId) {
  const found = await findClinicGoogleDriveRecordAmong([canonicalClinicId])
  return found?.record || null
}

export async function saveClinicGoogleDriveConnection(canonicalClinicId, patch) {
  const id = String(canonicalClinicId || '').trim()
  if (!id) throw new Error('clinicId canónico vacío')

  return enqueueWrite(async () => {
    const store = await loadStore()
    const prev = store.clinics[id] || {}
    const now = new Date().toISOString()
    const next = {
      ...prev,
      ...patch,
      clinicId: id,
      updatedAt: now,
    }
    store.clinics[id] = next
    await saveStore(store)
    await upsertPostgres(id, next)
    if (isConnectedDriveRecord(next)) {
      await putGoogleDriveCredentialCache(id, next)
    }
    return publicRow(next)
  })
}

export async function clearClinicGoogleDriveConnection(canonicalClinicId) {
  const id = String(canonicalClinicId || '').trim()
  if (!id) return publicRow(null)

  return enqueueWrite(async () => {
    const store = await loadStore()
    await clearGoogleDriveCredentialCache(id)
    const next = {
      clinicId: id,
      status: 'disconnected',
      googleDriveEmail: null,
      refreshTokenEnc: null,
      accessTokenEnc: null,
      tokenExpiresAt: null,
      rootFolderId: null,
      clinicName: store.clinics[id]?.clinicName || null,
      connectedAt: null,
      connectedByUserId: null,
      updatedAt: new Date().toISOString(),
    }
    store.clinics[id] = next
    await saveStore(store)
    await upsertPostgres(id, next)
    return publicRow(next)
  })
}
