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
  writeDurableJsonWithMerge,
} from './durableStore.js'

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
    await withPgClient(async (client) => {
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

/** Estado público (sin tokens). */
export async function getClinicGoogleDriveStatus(canonicalClinicId) {
  const id = String(canonicalClinicId || '').trim()
  if (!id) return publicRow(null)
  const store = await loadStore()
  return publicRow(store.clinics[id] || null)
}

function clinicIdLookupKeys(canonicalClinicId) {
  const id = String(canonicalClinicId || '').trim()
  if (!id) return []
  const keys = [id]
  if (id.startsWith('clinic:')) keys.push(id.slice('clinic:'.length))
  else keys.push(`clinic:${id}`)
  return [...new Set(keys.filter(Boolean))]
}

/** Fila interna con ciphertext (solo servicios de servidor). */
export async function getClinicGoogleDriveRecord(canonicalClinicId) {
  const id = String(canonicalClinicId || '').trim()
  if (!id) return null
  const store = await loadStore()
  for (const key of clinicIdLookupKeys(id)) {
    const row = store.clinics[key]
    if (row) return row
  }
  return null
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
    return publicRow(next)
  })
}

export async function clearClinicGoogleDriveConnection(canonicalClinicId) {
  const id = String(canonicalClinicId || '').trim()
  if (!id) return publicRow(null)

  return enqueueWrite(async () => {
    const store = await loadStore()
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
