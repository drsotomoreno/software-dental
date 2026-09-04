import { createRequire } from 'node:module'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

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
    ssl: local ? false : { rejectUnauthorized: false },
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

export async function readDurableJson(filePath, fallback, storeKey = STORE_KEY) {
  const db = getPool()
  if (db) {
    try {
      const client = await db.connect()
      try {
        await ensureTable(client)
        const { rows } = await client.query('SELECT value FROM app_json_store WHERE key = $1', [
          storeKey,
        ])
        if (rows[0]?.value && typeof rows[0].value === 'object') {
          return rows[0].value
        }
      } finally {
        client.release()
      }
    } catch (error) {
      console.error(
        '[store] PostgreSQL no disponible, se usa archivo local:',
        error instanceof Error ? error.message : error,
      )
    }
  }

  try {
    return JSON.parse(await readFile(filePath, 'utf8'))
  } catch {
    return fallback
  }
}

export async function writeDurableJson(filePath, value, storeKey = STORE_KEY) {
  await mkdir(dirname(filePath), { recursive: true })
  await writeFile(filePath, JSON.stringify(value, null, 2), 'utf8')

  const db = getPool()
  if (!db) return
  try {
    const client = await db.connect()
    try {
      await ensureTable(client)
      await client.query(
        `INSERT INTO app_json_store (key, value, updated_at)
         VALUES ($1, $2::jsonb, now())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
        [storeKey, JSON.stringify(value)],
      )
    } finally {
      client.release()
    }
  } catch (error) {
    console.error(
      '[store] No se pudo persistir el perfil en PostgreSQL:',
      error instanceof Error ? error.message : error,
    )
  }
}
