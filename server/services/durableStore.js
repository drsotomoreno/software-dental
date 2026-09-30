import { createRequire } from 'node:module'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { DATABASE_URL } from '../config.js'

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

/**
 * El host interno de Render (dpg-…-a, sin dominio) no habla TLS.
 * sslmode en la URL no se reenvía al pool: pg lo interpretaría y el handshake
 * dejaría el arranque colgado. Fuera de ese host se usa SSL sin verificar CA.
 */
export function postgresSslOption(connectionString) {
  try {
    const host = new URL(connectionString).hostname
    const internal =
      !host ||
      host === 'localhost' ||
      host === '127.0.0.1' ||
      !host.includes('.') ||
      /^dpg-[a-z0-9-]+$/i.test(host)
    if (internal) return false
    return { rejectUnauthorized: false }
  } catch {
    return false
  }
}

let postgresRetryAt = 0

function postgresCoolingDown() {
  return Date.now() < postgresRetryAt
}

function markPostgresUnavailable(error) {
  postgresRetryAt = Date.now() + 20_000
  console.error(
    '[store] PostgreSQL no disponible, se usa archivo local:',
    error instanceof Error ? error.message : error,
  )
}

function poolConfig(url) {
  const ssl = postgresSslOption(url)
  const common = {
    max: 2,
    connectionTimeoutMillis: 8_000,
    idleTimeoutMillis: 20_000,
    ssl,
  }
  try {
    const parsed = new URL(url)
    // No se pasa connectionString: un sslmode=require ahí vuelve a encender SSL
    // y anula el bypass del host interno de Render.
    return {
      ...common,
      user: decodeURIComponent(parsed.username),
      password: decodeURIComponent(parsed.password),
      host: parsed.hostname,
      port: parsed.port ? Number(parsed.port) : 5432,
      database: decodeURIComponent(parsed.pathname.replace(/^\//, '')),
    }
  } catch {
    return { ...common, connectionString: url, ssl: false }
  }
}

function getPool() {
  if (pool !== undefined) return pool
  const Pool = loadPgPool()
  const url = DATABASE_URL
  if (!Pool || !url) {
    pool = null
    return null
  }
  pool = new Pool(poolConfig(url))
  // Sin este listener, node-pg emite 'error' en un cliente inactivo y Node apaga el proceso.
  pool.on('error', (err) => {
    console.error(
      '[store] Cliente PostgreSQL inactivo desconectado:',
      err instanceof Error ? err.message : err,
    )
  })
  return pool
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
  if (postgresCoolingDown()) return null
  const db = getPool()
  if (!db) return null
  try {
    const client = await db.connect()
    try {
      await ensureTable(client)
      const { rows } = await client.query('SELECT value FROM app_json_store WHERE key = $1', [
        storeKey,
      ])
      const value = rows[0]?.value
      return value && typeof value === 'object' ? value : null
    } finally {
      client.release()
    }
  } catch (error) {
    markPostgresUnavailable(error)
    return null
  }
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

  if (postgresCoolingDown()) return
  const db = getPool()
  if (!db) return
  try {
    const client = await db.connect()
    try {
      await ensureTable(client)
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
    } finally {
      client.release()
    }
  } catch (error) {
    markPostgresUnavailable(error)
  }
}

/** Lectura con fusionador propio (no usar mergeDurableStores de usuarios/sesiones). */
export async function readDurableJsonWithMerge(filePath, fallback, storeKey, mergeFn) {
  const fileValue = await readJsonFile(filePath)
  const pgValue = postgresCoolingDown() ? null : await readPostgresJson(storeKey)
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

  if (postgresCoolingDown()) return
  const db = getPool()
  if (!db) return
  try {
    const client = await db.connect()
    try {
      await ensureTable(client)
      const { rows } = await client.query('SELECT value FROM app_json_store WHERE key = $1', [
        storeKey,
      ])
      const current = rows[0]?.value && typeof rows[0].value === 'object' ? rows[0].value : null
      const toWrite =
        current && typeof mergeFn === 'function' ? mergeFn(value, current) : value
      await client.query(
        `INSERT INTO app_json_store (key, value, updated_at)
         VALUES ($1, $2::jsonb, now())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
        [storeKey, JSON.stringify(toWrite)],
      )
    } finally {
      client.release()
    }
  } catch (error) {
    markPostgresUnavailable(error)
  }
}
