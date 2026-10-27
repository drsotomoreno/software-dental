/**
 * Lee clinics.custom_max_assistants.
 * La columna solo limita auxiliares cuando el plan del titular es corporativo.
 */
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { withPgClient } from './durableStore.js'
import { splitSqlStatements } from './consultasRepository.js'

const MIGRATION_FILE = join(
  dirname(fileURLToPath(import.meta.url)),
  '../db/migrations/20261027160000_clinics_custom_max_assistants.sql',
)

export const SQL_READ_CUSTOM_MAX_ASSISTANTS =
  'SELECT custom_max_assistants FROM clinics WHERE id::text = $1 LIMIT 1'

let schemaReady = null

export async function ensureClinicAssistantSchema() {
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

/**
 * @returns {{ found: boolean, available: boolean, value?: number | null }}
 * `found` false: no hay fila (o Postgres no respondió). Se usa el valor de la cuenta.
 * `found` true: la columna manda, aunque sea NULL.
 */
export async function readClinicAssistantLimit(clinicId) {
  const id = String(clinicId ?? '').trim()
  if (!id) return { found: false, available: false }
  try {
    await ensureClinicAssistantSchema()
    return await withPgClient(async (client) => {
      const { rows } = await client.query(SQL_READ_CUSTOM_MAX_ASSISTANTS, [id])
      if (!rows.length) return { found: false, available: true }
      return {
        found: true,
        available: true,
        value: rows[0].custom_max_assistants ?? null,
      }
    })
  } catch (error) {
    if (error?.code !== 'PG_UNAVAILABLE') {
      console.error(
        '[clinics] No se pudo leer custom_max_assistants:',
        error instanceof Error ? error.message : error,
      )
    }
    return { found: false, available: false }
  }
}
