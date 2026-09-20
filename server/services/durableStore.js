import { createRequire } from 'node:module'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import '../config.js'

const STORE_KEY = 'subscription-users'
const require = createRequire(import.meta.url)

let pool = undefined
let PoolCtor

function loadPgPool() {
  if (PoolCtor !== undefined) return PoolCtor
  try {
    const pg = require('pg')
    PoolCtor = pg.Pool
  } catch (error) {
    console.error(
      '[store] No se encontró el paquete pg. Instálelo con npm install pg. Se usará archivo local.',
      error instanceof Error ? error.message : error,
    )
    PoolCtor = null
  }
  return PoolCtor
}

function getPool() {
  if (pool !== undefined) return pool
  const Pool = loadPgPool()
  const url = process.env.DATABASE_URL
  if (!Pool || !url) {
    pool = null
    return null
  }
  const local = /localhost|127\.0\.0\.1/.test(url)
  pool = new Pool({
    connectionString: url,
    max: 2,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    ssl: local ? false : { rejectUnauthorized: false },
  })
  // Evita que un corte de red en un cliente inactivo apague el proceso.
  // El pool descarta el cliente muerto y abre uno nuevo en el próximo query.
  pool.on('error', (err) => {
    console.error(
      '[store] Error inesperado en el cliente de PostgreSQL inactivo',
      err instanceof Error ? err.message : err,
    )
  })
  return pool
}

export { getPool as getPostgresPool }

const CONNECT_RETRY_ATTEMPTS = 3
const CONNECT_RETRY_DELAY_MS = 400

function isTransientPgError(error) {
  const code = typeof error?.code === 'string' ? error.code : ''
  const message = String(error?.message ?? error ?? '')
  return (
    code === 'ECONNRESET' ||
    code === 'ETIMEDOUT' ||
    code === 'EPIPE' ||
    code === '57P01' ||
    code === '57P02' ||
    code === '57P03' ||
    /connection terminated|server closed the connection|timeout expired/i.test(message)
  )
}

async function withPostgresClient(fn) {
  const db = getPool()
  if (!db) return { ok: false }

  let lastError
  for (let attempt = 1; attempt <= CONNECT_RETRY_ATTEMPTS; attempt++) {
    try {
      const client = await db.connect()
      try {
        await ensureTable(client)
        return { ok: true, value: await fn(client) }
      } finally {
        client.release()
      }
    } catch (error) {
      lastError = error
      const retry = attempt < CONNECT_RETRY_ATTEMPTS && isTransientPgError(error)
      if (!retry) break
      console.error(
        `[store] Conexión a PostgreSQL caída (intento ${attempt}/${CONNECT_RETRY_ATTEMPTS}), reintentando...`,
        error instanceof Error ? error.message : error,
      )
      await new Promise((resolve) => setTimeout(resolve, CONNECT_RETRY_DELAY_MS * attempt))
    }
  }
  return { ok: false, error: lastError }
}

async function ensureTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS app_json_store (
      key text PRIMARY KEY,
      value jsonb NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `)
}

async function readJsonFile(filePath) {
  try {
    const parsed = JSON.parse(await readFile(filePath, 'utf8'))
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

async function readPostgresJson(storeKey) {
  const { ok, value, error } = await withPostgresClient(async (client) => {
    const { rows } = await client.query('SELECT value FROM app_json_store WHERE key = $1', [
      storeKey,
    ])
    const rowValue = rows[0]?.value
    return rowValue && typeof rowValue === 'object' ? rowValue : null
  })
  if (!ok) {
    if (error) {
      console.error(
        '[store] PostgreSQL no disponible, se usa archivo local:',
        error instanceof Error ? error.message : error,
      )
    }
    return null
  }
  return value ?? null
}

function stamp(item) {
  return Date.parse(item?.updatedAt || item?.createdAt || 0) || 0
}

function mergeByKey(secondary = [], primary = [], key, primaryWins) {
  const map = new Map()
  for (const item of secondary) {
    if (!item || item[key] == null) continue
    map.set(String(item[key]), item)
  }
  for (const item of primary) {
    if (!item || item[key] == null) continue
    const id = String(item[key])
    const prev = map.get(id)
    if (!prev || primaryWins || stamp(item) >= stamp(prev)) {
      map.set(id, item)
    }
  }
  return [...map.values()]
}

const MAX_SESSIONS = 400

function mergeSessions(secondary = [], primary = []) {
  const map = new Map()
  for (const session of [...secondary, ...primary]) {
    if (session?.token) map.set(String(session.token), session)
  }
  return [...map.values()]
    .sort((a, b) => stamp(b) - stamp(a))
    .slice(0, MAX_SESSIONS)
}

export function mergeDurableStores(primary, secondary, { primaryUserWins = false } = {}) {
  if (!primary || typeof primary !== 'object') return secondary && typeof secondary === 'object' ? secondary : primary
  if (!secondary || typeof secondary !== 'object') return primary

  const merged = { ...secondary, ...primary }
  if (Array.isArray(primary.users) || Array.isArray(secondary.users)) {
    merged.users = mergeByKey(secondary.users, primary.users, 'id', primaryUserWins)
  }
  if (Array.isArray(primary.sessions) || Array.isArray(secondary.sessions)) {
    merged.sessions = mergeSessions(secondary.sessions, primary.sessions)
  }
  if (Array.isArray(primary.passwordResets) || Array.isArray(secondary.passwordResets)) {
    merged.passwordResets = mergeByKey(secondary.passwordResets, primary.passwordResets, 'tokenHash', primaryUserWins)
  }
  if (Array.isArray(primary.emailVerifications) || Array.isArray(secondary.emailVerifications)) {
    merged.emailVerifications = mergeByKey(
      secondary.emailVerifications,
      primary.emailVerifications,
      'tokenHash',
      primaryUserWins,
    )
  }
  return merged
}

export async function readDurableJson(filePath, fallback, storeKey = STORE_KEY) {
  const fileValue = await readJsonFile(filePath)
  const pgValue = await readPostgresJson(storeKey)

  if (pgValue && fileValue) return mergeDurableStores(fileValue, pgValue)
  if (pgValue) return pgValue
  if (fileValue) return fileValue
  return fallback
}

export async function writeDurableJson(filePath, value, storeKey = STORE_KEY) {
  await mkdir(dirname(filePath), { recursive: true })
  await writeFile(filePath, JSON.stringify(value, null, 2), 'utf8')

  const { ok, error } = await withPostgresClient(async (client) => {
    const { rows } = await client.query('SELECT value FROM app_json_store WHERE key = $1', [
      storeKey,
    ])
    const current = rows[0]?.value && typeof rows[0].value === 'object' ? rows[0].value : null
    const toWrite = current ? mergeDurableStores(value, current, { primaryUserWins: true }) : value
    await client.query(
      `INSERT INTO app_json_store (key, value, updated_at)
       VALUES ($1, $2::jsonb, now())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      [storeKey, JSON.stringify(toWrite)],
    )
  })
  if (!ok && error) {
    console.error(
      '[store] No se pudo persistir el perfil en PostgreSQL; se conserva el archivo local:',
      error instanceof Error ? error.message : error,
    )
  }
}

/** Lectura con fusionador propio (no usar mergeDurableStores de usuarios/sesiones). */
export async function readDurableJsonWithMerge(filePath, fallback, storeKey, mergeFn) {
  const fileValue = await readJsonFile(filePath)
  const pgValue = await readPostgresJson(storeKey)
  const base = fallback && typeof fallback === 'object' ? fallback : {}

  if (pgValue && fileValue && typeof mergeFn === 'function') {
    return mergeFn(fileValue, pgValue)
  }
  if (pgValue) return typeof mergeFn === 'function' ? mergeFn(base, pgValue) : pgValue
  if (fileValue) return typeof mergeFn === 'function' ? mergeFn(base, fileValue) : fileValue
  return fallback
}

/**
 * Persistencia para almacenes que no son el de usuarios.
 * El fusionador opcional combina el valor nuevo con el JSON actual en Postgres.
 */
export async function writeDurableJsonWithMerge(filePath, value, storeKey, mergeFn) {
  await mkdir(dirname(filePath), { recursive: true })
  await writeFile(filePath, JSON.stringify(value, null, 2), 'utf8')

  const { ok, error } = await withPostgresClient(async (client) => {
    const { rows } = await client.query('SELECT value FROM app_json_store WHERE key = $1', [
      storeKey,
    ])
    const current = rows[0]?.value && typeof rows[0].value === 'object' ? rows[0].value : null
    const toWrite = current && typeof mergeFn === 'function' ? mergeFn(value, current) : value
    await client.query(
      `INSERT INTO app_json_store (key, value, updated_at)
       VALUES ($1, $2::jsonb, now())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      [storeKey, JSON.stringify(toWrite)],
    )
  })
  if (!ok && error) {
    console.error(
      '[store] No se pudo persistir el almacén en PostgreSQL; se conserva el archivo local:',
      error instanceof Error ? error.message : error,
    )
  }
}
