/**
 * Pacientes + historias_clinicas en Postgres (multi-tenant + soft-delete).
 * Aplica migraciones RBAC y clínicas al primer uso.
 */
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { withPgClient } from './durableStore.js'
import { splitSqlStatements } from './consultasRepository.js'
import { ensureTenantRbacSchema } from './tenantRbacStore.js'

const DIR = dirname(fileURLToPath(import.meta.url))
const MIGRATIONS = [
  join(DIR, '../db/migrations/20261102143000_clinicas_usuarios_rbac.sql'),
  join(DIR, '../db/migrations/20261102150000_pacientes_historias_clinicas.sql'),
]

let schemaReady = null

export async function ensureClinicalTenantSchema() {
  if (!schemaReady) {
    schemaReady = (async () => {
      await ensureTenantRbacSchema()
      await withPgClient(async (client) => {
        for (const file of MIGRATIONS) {
          const sql = await readFile(file, 'utf8')
          for (const statement of splitSqlStatements(sql)) {
            await client.query(statement)
          }
        }
      })
    })().catch((error) => {
      schemaReady = null
      throw error
    })
  }
  return schemaReady
}

/**
 * Filtro SQL de aislamiento.
 * Superadmin: sin filtro de clínica (God Mode).
 * Resto: obliga clinica_id = $n.
 *
 * @returns {{ clause: string, params: unknown[], nextIndex: number }}
 */
export function clinicScopeSql({ is_superadmin, clinica_id }, column = 'clinica_id', startIndex = 1) {
  if (is_superadmin) {
    return { clause: 'TRUE', params: [], nextIndex: startIndex }
  }
  const id = String(clinica_id ?? '').trim()
  if (!id) {
    const error = new Error('clinica_id requerido para isolation multi-tenant.')
    error.status = 403
    error.code = 'TENANT_REQUIRED'
    throw error
  }
  return {
    clause: `${column} = $${startIndex}::uuid`,
    params: [id],
    nextIndex: startIndex + 1,
  }
}

/** Cambios desde `since` para pull offline (vivos + borrados). */
export async function listPacientesForSync({ user, since = null, limit = 500 }) {
  await ensureClinicalTenantSchema()
  const scope = clinicScopeSql(user)
  const params = [...scope.params]
  let sinceClause = ''
  if (since) {
    params.push(since)
    sinceClause = ` AND updated_at > $${params.length}::timestamptz`
  }
  params.push(Math.min(Number(limit) || 500, 2000))
  const sql = `
    SELECT *
    FROM pacientes
    WHERE ${scope.clause}${sinceClause}
    ORDER BY updated_at ASC
    LIMIT $${params.length}
  `
  return withPgClient(async (client) => {
    const { rows } = await client.query(sql, params)
    return rows
  })
}

export async function listHistoriasForSync({ user, since = null, limit = 500 }) {
  await ensureClinicalTenantSchema()
  const scope = clinicScopeSql(user)
  const params = [...scope.params]
  let sinceClause = ''
  if (since) {
    params.push(since)
    sinceClause = ` AND updated_at > $${params.length}::timestamptz`
  }
  params.push(Math.min(Number(limit) || 500, 2000))
  const sql = `
    SELECT *
    FROM historias_clinicas
    WHERE ${scope.clause}${sinceClause}
    ORDER BY updated_at ASC
    LIMIT $${params.length}
  `
  return withPgClient(async (client) => {
    const { rows } = await client.query(sql, params)
    return rows
  })
}

/** Soft-delete de paciente (y deja historias para CASCADE solo en hard delete). */
export async function softDeletePaciente({ user, pacienteId }) {
  await ensureClinicalTenantSchema()
  const scope = clinicScopeSql(user)
  const params = [...scope.params, pacienteId]
  const sql = `
    UPDATE pacientes
    SET deleted_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    WHERE ${scope.clause}
      AND id = $${params.length}::uuid
      AND deleted_at IS NULL
    RETURNING id, clinica_id, deleted_at, updated_at
  `
  return withPgClient(async (client) => {
    const { rows } = await client.query(sql, params)
    return rows[0] || null
  })
}
