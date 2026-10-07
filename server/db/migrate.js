import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const MIGRATION_VERSION = '001_cuv_expedientes'
const migrationPath = join(dirname(fileURLToPath(import.meta.url)), 'migrations', `${MIGRATION_VERSION}.sql`)

/**
 * Aplica la migración del expediente CUV si esa versión no está registrada.
 * `query` debe cumplir la forma de node-pg: (sql, params) => { rows }.
 *
 * @param {(sql: string, params?: unknown[]) => Promise<{ rows?: unknown[] }>} query
 */
export async function applyCuvMigration(query) {
  await query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `)
  const existing = await query('SELECT version FROM schema_migrations WHERE version = $1', [MIGRATION_VERSION])
  if ((existing.rows ?? []).length > 0) return { applied: false, version: MIGRATION_VERSION }

  const sql = await readFile(migrationPath, 'utf8')
  await query(sql)
  await query('INSERT INTO schema_migrations (version) VALUES ($1) ON CONFLICT (version) DO NOTHING', [
    MIGRATION_VERSION,
  ])
  return { applied: true, version: MIGRATION_VERSION }
}

export { MIGRATION_VERSION }
