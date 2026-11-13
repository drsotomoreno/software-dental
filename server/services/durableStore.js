import { createRequire } from 'node:module'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { DATABASE_URL } from '../config.js'
import { keepStoredDocumentNumber } from '../../shared/professionalDocument.js'

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
 * Localhost / host interno sin dominio no habla TLS.
 * Hosts remotos (AWS RDS, Render externo, etc.) usan SSL sin verificar CA.
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

/**
 * Quita `sslmode` (y `ssl`) del query string: en pg 8 chocan con `ssl: { rejectUnauthorized: false }`.
 */
export function stripSslModeFromConnectionString(connectionString) {
  const raw = String(connectionString || '').trim()
  if (!raw) return raw
  try {
    const parsed = new URL(raw)
    parsed.searchParams.delete('sslmode')
    parsed.searchParams.delete('ssl')
    return parsed.toString()
  } catch {
    return raw
      .replace(/([?&])sslmode=[^&]*/gi, '$1')
      .replace(/([?&])ssl=[^&]*/gi, '$1')
      .replace(/\?&/, '?')
      .replace(/[?&]$/, '')
  }
}

let postgresRetryAt = 0

function postgresCoolingDown() {
  return Date.now() < postgresRetryAt
}

function connectionErrorText(error) {
  const code = error && typeof error === 'object' && typeof error.code === 'string' ? error.code : ''
  const raw = error instanceof Error ? error.message : String(error ?? '')
  const message = raw
    .replace(/postgres(?:ql)?:\/\/\S+/gi, 'postgresql://***')
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?\b/g, '')
    .replace(/\bdpg-[a-z0-9-]+\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
  if (code && message && !message.includes(code)) return `${code}: ${message}`
  return message || code || 'error de conexión'
}

function markPostgresUnavailable(error) {
  // Enfriamiento breve: reintenta pronto sin martillar RDS en cada request.
  postgresRetryAt = Date.now() + 15_000
  console.error('[store] Error de conexión a PostgreSQL:', connectionErrorText(error))
}

function decodeConnectionPart(value) {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function isConnectionTerminatedError(error) {
  const code = error && typeof error === 'object' ? String(error.code || '') : ''
  const message = error instanceof Error ? error.message : String(error ?? '')
  return (
    code === 'ECONNRESET' ||
    code === 'ETIMEDOUT' ||
    code === 'EPIPE' ||
    code === '57P01' ||
    /connection terminated/i.test(message) ||
    /Connection terminated/i.test(message) ||
    /timeout expired/i.test(message) ||
    /Client has encountered a connection error/i.test(message)
  )
}

export function poolConfig(url) {
  const remoteSsl = postgresSslOption(url)
  const isRemote = remoteSsl !== false

  // AWS RDS / hosts remotos: un solo pool compartido (withPgClient) con keepAlive.
  // max:5 evita saturar una instancia RDS micro.
  if (isRemote) {
    return {
      connectionString: stripSslModeFromConnectionString(url),
      ssl: { rejectUnauthorized: false },
      keepAlive: true,
      keepAliveInitialDelayMillis: 10_000,
      connectionTimeoutMillis: 20_000,
      idleTimeoutMillis: 30_000,
      max: 5,
      allowExitOnIdle: true,
    }
  }

  // Localhost / host interno: sin TLS; params discretos evitan ambigüedad.
  const common = {
    max: 2,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10_000,
    connectionTimeoutMillis: 8_000,
    idleTimeoutMillis: 30_000,
    ssl: false,
    allowExitOnIdle: true,
  }
  try {
    const parsed = new URL(url)
    return {
      ...common,
      user: decodeConnectionPart(parsed.username),
      password: decodeConnectionPart(parsed.password),
      host: parsed.hostname,
      port: parsed.port ? Number(parsed.port) : 5432,
      database: decodeConnectionPart(parsed.pathname.replace(/^\//, '')),
    }
  } catch {
    return {
      ...common,
      connectionString: stripSslModeFromConnectionString(url),
    }
  }
}

/**
 * Ejecuta trabajo contra el Postgres de mihistoriadental.
 * Si el socket se corta (`Connection terminated`), reintenta 1 vez antes del enfriamiento.
 * @param {(client: import('pg').PoolClient) => Promise<unknown>} fn
 */
export async function withPgClient(fn) {
  if (postgresCoolingDown()) {
    const error = new Error('PostgreSQL en enfriamiento tras fallo de conexión.')
    error.code = 'PG_COOLDOWN'
    throw error
  }
  const db = getPool()
  if (!db) {
    const error = new Error('PostgreSQL no está configurado.')
    error.code = 'PG_UNAVAILABLE'
    throw error
  }

  const runOnce = async () => {
    let client
    try {
      client = await db.connect()
    } catch (error) {
      throw error
    }
    try {
      return await fn(client)
    } finally {
      try {
        client.release()
      } catch {
        // ignore
      }
    }
  }

  try {
    return await runOnce()
  } catch (error) {
    if (!isConnectionTerminatedError(error)) {
      if (
        error &&
        typeof error === 'object' &&
        (error.code === 'ECONNREFUSED' ||
          error.code === 'ENOTFOUND' ||
          error.code === 'EAI_AGAIN')
      ) {
        markPostgresUnavailable(error)
      }
      throw error
    }
    console.warn(
      '[store] Conexión PostgreSQL terminada; reintento único…',
      connectionErrorText(error),
    )
    try {
      return await runOnce()
    } catch (retryError) {
      markPostgresUnavailable(retryError)
      throw retryError
    }
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
    markPostgresUnavailable(err)
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

function preserveProfessionalIdentity(chosen, other) {
  if (!chosen || typeof chosen !== 'object' || !other || typeof other !== 'object') return chosen
  const hasDocument = chosen.documentNumber != null || other.documentNumber != null
  const hasRethus = chosen.rethusNumber != null || other.rethusNumber != null
  if (!hasDocument && !hasRethus) return chosen

  const next = { ...chosen }
  if (hasDocument) {
    const type = chosen.documentType || other.documentType || 'CC'
    const kept = keepStoredDocumentNumber(other.documentNumber, chosen.documentNumber, type)
    if (kept) {
      next.documentNumber = kept
      if (!next.documentType && other.documentType) next.documentType = other.documentType
    }
  }
  const chosenRethus = String(chosen.rethusNumber ?? '').trim()
  const otherRethus = String(other.rethusNumber ?? '').trim()
  if (!chosenRethus && otherRethus) next.rethusNumber = otherRethus
  return next
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
      map.set(id, prev ? preserveProfessionalIdentity(item, prev) : item)
    } else if (prev) {
      map.set(id, preserveProfessionalIdentity(prev, item))
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
    // OTP viven en almacén dedicado; este arreglo es legado.
    // Siempre fusionar por email: un save concurrente con lista vacía NO debe borrar OTPs.
    merged.emailVerifications = mergeByKey(
      secondary.emailVerifications,
      primary.emailVerifications,
      'email',
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

/**
 * Lectura/escritura de un documento JSON aislado en app_json_store (una fila por clave).
 * Ideal para OTP de registro: no se mezclan con subscription-users ni se pierden en merges.
 */
export async function readJsonDocument(storeKey) {
  if (postgresCoolingDown()) return null
  return readPostgresJson(storeKey)
}

export async function writeJsonDocument(storeKey, value) {
  if (postgresCoolingDown()) {
    const error = new Error('PostgreSQL en enfriamiento; no se pudo persistir el documento.')
    error.code = 'PG_COOLDOWN'
    throw error
  }
  const db = getPool()
  if (!db) {
    const error = new Error('PostgreSQL no está configurado.')
    error.code = 'PG_UNAVAILABLE'
    throw error
  }
  try {
    const client = await db.connect()
    try {
      await ensureTable(client)
      await client.query(
        `INSERT INTO app_json_store (key, value, updated_at)
         VALUES ($1::text, $2::jsonb, now())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
        [storeKey, JSON.stringify(value)],
      )
    } finally {
      client.release()
    }
  } catch (error) {
    markPostgresUnavailable(error)
    throw error
  }
}

export async function deleteJsonDocument(storeKey) {
  if (postgresCoolingDown()) return false
  const db = getPool()
  if (!db) return false
  try {
    const client = await db.connect()
    try {
      await ensureTable(client)
      await client.query('DELETE FROM app_json_store WHERE key = $1::text', [storeKey])
      return true
    } finally {
      client.release()
    }
  } catch (error) {
    markPostgresUnavailable(error)
    return false
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
