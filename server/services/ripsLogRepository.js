/**
 * Auditoría RDS de la radicación RIPS y estado de transmisión en atenciones.
 * La migración de rips_logs se aplica al insertar. El estado de la atención
 * reutiliza el esquema de cobro, que ya crea atenciones y rips_estado.
 */
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { withPgClient } from './durableStore.js'
import { splitSqlStatements } from './consultasRepository.js'
import { ensureCobroSchema } from './cobroConsecutivosRepository.js'

const MIGRATION_FILE = join(
  dirname(fileURLToPath(import.meta.url)),
  '../db/migrations/20261024125200_rips_logs.sql',
)

const ERROR_LOG_MAX = 4_000
const ESTADOS_TRANSMISION = new Set(['enviado_ok', 'error'])

export const SQL_INSERTAR_RIPS_LOG = `INSERT INTO rips_logs (
         usuario_prestador, usuario_prestador_id, nit_prestador, evolution_id, patient_id,
         batch_id, modo, canal, http_status, cuv, success, request_payload, response_muv,
         errors, duration_ms
       ) VALUES (
         $1::jsonb, $2, $3, $4, $5, $6::uuid, $7, $8, $9, $10, $11, $12::jsonb, $13::jsonb, $14::jsonb, $15
       )
       RETURNING id, created_at`

export const SQL_ACTUALIZAR_ATENCION_RIPS = `UPDATE atenciones
       SET rips_estado = $2,
           cuv = $3,
           rips_fecha_transmision = CASE WHEN $2 = 'enviado_ok' THEN now() ELSE rips_fecha_transmision END,
           rips_error_log = $4,
           updated_at = now()
       WHERE evolution_note_id = $1 OR id::text = $1
       RETURNING id`

let schemaReady = null

function aJson(value) {
  if (value == null) return null
  try {
    return JSON.stringify(value)
  } catch {
    return JSON.stringify({ omitted: true, reason: 'no_serializable' })
  }
}

function esEsquemaAusente(error) {
  return error?.code === '42P01' || error?.code === '42703'
}

export async function ensureRipsLogsSchema() {
  if (!schemaReady) {
    schemaReady = withPgClient(async (client) => {
      const sql = await readFile(MIGRATION_FILE, 'utf8')
      for (const statement of splitSqlStatements(sql)) {
        try {
          await client.query(statement)
        } catch (error) {
          const detail = error instanceof Error ? error.message : String(error)
          const wrapped = new Error(`${detail} — sentencia: ${statement}`)
          wrapped.code = error?.code
          wrapped.cause = error
          throw wrapped
        }
      }
    }).catch((error) => {
      schemaReady = null
      throw error
    })
  }
  return schemaReady
}

function mapLog(row) {
  if (!row) return null
  return { id: row.id, createdAt: row.created_at }
}

/**
 * @param {object} entry
 * @param {{ query: Function }} [client]
 */
export async function registrarRipsLog(entry, client) {
  const params = [
    aJson(entry.usuarioPrestador ?? {}),
    entry.usuarioPrestadorId ?? null,
    entry.nitPrestador ?? null,
    entry.evolutionId ?? null,
    entry.patientId ?? null,
    entry.batchId ?? null,
    entry.modo,
    entry.canal,
    Number.isInteger(entry.httpStatus) ? entry.httpStatus : null,
    entry.cuv ?? null,
    entry.success === true,
    aJson(entry.requestPayload),
    aJson(entry.responseMuv),
    aJson(entry.errors ?? []),
    Number.isFinite(entry.durationMs) ? Math.round(entry.durationMs) : null,
  ]

  const run = async (db) => {
    const { rows } = await db.query(SQL_INSERTAR_RIPS_LOG, params)
    const saved = mapLog(rows[0])
    console.info('[rips-logs] transacción registrada', {
      id: saved?.id ?? null,
      canal: entry.canal,
      modo: entry.modo,
      success: entry.success === true,
      evolutionId: entry.evolutionId ?? null,
    })
    return saved
  }

  try {
    if (client) return await run(client)
    await ensureRipsLogsSchema()
    return await withPgClient(run)
  } catch (error) {
    console.error('[rips-logs] no se pudo guardar la auditoría', {
      code: error?.code ?? null,
      message: error instanceof Error ? error.message.slice(0, 300) : String(error),
    })
    throw error
  }
}

/**
 * Actualiza la transmisión MUV de la atención ligada a la evolución.
 * Un timeout no debe llamar aquí: el estado queda listo para reintentar.
 * Si la tabla o la columna aún no existen, no tumba el CUV ya otorgado.
 * @param {string} evolutionId
 * @param {{ estado: 'enviado_ok' | 'error', cuv?: string | null, errorLog?: string | null }} patch
 * @param {{ query: Function }} [client]
 */
export async function actualizarAtencionRips(evolutionId, patch, client) {
  const id = String(evolutionId ?? '').trim()
  if (!id) return { updated: false, reason: 'sin_evolucion' }
  if (!ESTADOS_TRANSMISION.has(patch?.estado)) {
    throw new Error('rips_estado de transmisión debe ser enviado_ok o error.')
  }

  const errorLog = patch.errorLog ? String(patch.errorLog).slice(0, ERROR_LOG_MAX) : null
  const params = [id, patch.estado, patch.cuv ?? null, errorLog]
  const run = async (db) => {
    try {
      const result = await db.query(SQL_ACTUALIZAR_ATENCION_RIPS, params)
      const updated = (result.rowCount ?? result.rows?.length ?? 0) > 0
      if (!updated) {
        console.warn('[rips] ninguna atención coincide con la evolución', { evolutionId: id })
      }
      return { updated, reason: updated ? 'ok' : 'sin_fila' }
    } catch (error) {
      if (esEsquemaAusente(error)) {
        console.warn('[rips] atenciones sin columnas de transmisión; el CUV queda en rips_logs', {
          code: error.code,
          evolutionId: id,
        })
        return { updated: false, reason: 'esquema_ausente' }
      }
      throw error
    }
  }

  try {
    if (client) return await run(client)
    await ensureCobroSchema()
    return await withPgClient(run)
  } catch (error) {
    console.error('[rips] no se pudo actualizar el estado de la atención', {
      code: error?.code ?? null,
      evolutionId: id,
      message: error instanceof Error ? error.message.slice(0, 300) : String(error),
    })
    throw error
  }
}
