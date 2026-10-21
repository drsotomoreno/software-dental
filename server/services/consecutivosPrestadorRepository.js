/**
 * Reserva atómica del recibo de caja RC- por titular.
 * La numeración FEV no pasa por estas tablas.
 */
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { formatNumeroReciboCaja, TIPO_DOC_RECIBO_CAJA } from '../../shared/ripsCobroFlow.js'

const MIGRATION_FILE = join(
  dirname(fileURLToPath(import.meta.url)),
  '../db/migrations/20261021120000_consecutivos_prestador.sql',
)

export const SQL_RESERVAR_RECIBO_CAJA = `WITH seq AS (
  INSERT INTO consecutivos_prestador (usuario_titular_id, tipo_documento, prefijo, ultimo_consecutivo)
  VALUES ($1, 'RECIBO_CAJA', 'RC-', 1)
  ON CONFLICT (usuario_titular_id, tipo_documento)
  DO UPDATE SET
    ultimo_consecutivo = consecutivos_prestador.ultimo_consecutivo + 1,
    updated_at = now()
  RETURNING usuario_titular_id, tipo_documento, prefijo, ultimo_consecutivo
)
INSERT INTO recibos_caja (
  usuario_titular_id, tipo_documento, consecutivo, numero_documento, prefijo, monto,
  patient_id, payment_id, clinical_record_id
)
SELECT
  usuario_titular_id,
  tipo_documento,
  ultimo_consecutivo,
  prefijo || lpad(ultimo_consecutivo::text, 5, '0'),
  prefijo,
  $2,
  $3,
  $4,
  $5
FROM seq
RETURNING id, usuario_titular_id, tipo_documento, consecutivo, numero_documento, monto`

let schemaReady = null

export async function ensureConsecutivosSchema(deps = {}) {
  const { withPgClient } = await import('./durableStore.js')
  const run = deps.withClient ?? withPgClient
  if (deps.client) return
  if (!schemaReady) {
    schemaReady = run(async (client) => {
      const sql = await readFile(MIGRATION_FILE, 'utf8')
      const { splitSqlStatements } = await import('./consultasRepository.js')
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

function mapRecibo(row) {
  if (!row) return null
  return {
    id: row.id,
    usuarioTitularId: row.usuario_titular_id,
    tipoDocumento: row.tipo_documento,
    consecutivo: Number(row.consecutivo),
    numeroDocumento: row.numero_documento,
    monto: Number(row.monto ?? 0),
  }
}

/**
 * @param {{
 *   usuarioTitularId: string,
 *   monto?: number,
 *   patientId?: string | null,
 *   paymentId?: string | null,
 *   clinicalRecordId?: string | null,
 * }} input
 * @param {{ client?: { query: Function }, withClient?: Function }} [deps]
 */
export async function reservarReciboCaja(input, deps = {}) {
  const usuarioTitularId = String(input?.usuarioTitularId ?? '').trim()
  if (!usuarioTitularId) {
    const error = new Error('El recibo de caja exige el titular de la clínica.')
    error.statusCode = 400
    throw error
  }
  const monto = Number(input.monto ?? 0)
  if (!Number.isFinite(monto) || monto <= 0) {
    const error = new Error('El recibo de caja solo se reserva cuando el cobro es mayor que cero.')
    error.statusCode = 400
    throw error
  }

  const params = [
    usuarioTitularId,
    monto,
    input.patientId != null ? String(input.patientId) : null,
    input.paymentId != null ? String(input.paymentId) : null,
    input.clinicalRecordId != null ? String(input.clinicalRecordId) : null,
  ]

  const ejecutar = async (client) => {
    await client.query('BEGIN')
    try {
      const { rows } = await client.query(SQL_RESERVAR_RECIBO_CAJA, params)
      const recibo = mapRecibo(rows[0])
      if (!recibo || recibo.numeroDocumento !== formatNumeroReciboCaja(recibo.consecutivo)) {
        throw new Error('La reserva del recibo no devolvió un número RC- válido.')
      }
      if (recibo.tipoDocumento !== TIPO_DOC_RECIBO_CAJA) {
        throw new Error('La reserva quedó en un tipo de documento distinto de RECIBO_CAJA.')
      }
      await client.query('COMMIT')
      return recibo
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    }
  }

  if (deps.client) return ejecutar(deps.client)
  await ensureConsecutivosSchema(deps)
  const { withPgClient } = await import('./durableStore.js')
  const run = deps.withClient ?? withPgClient
  return run(ejecutar)
}
