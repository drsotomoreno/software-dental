/**
 * Consecutivos de cobro por titular y extensión de pago de la atención.
 * La migración vive en server/db/migrations y se aplica al reservar un consecutivo.
 */
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { withPgClient } from './durableStore.js'
import { splitSqlStatements } from './consultasRepository.js'

const MIGRATION_DIR = join(dirname(fileURLToPath(import.meta.url)), '../db/migrations')
const MIGRATION_FILES = [
  join(MIGRATION_DIR, '20261022133400_consecutivos_prestador_atenciones.sql'),
  join(MIGRATION_DIR, '20261023140000_atenciones_rips_metadata.sql'),
]

const TIPOS = new Set(['RECIBO_CAJA', 'CUENTA_COBRO'])
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/** Reserva el siguiente consecutivo del titular. Atómica en PostgreSQL. */
export const SQL_RESERVAR_CONSECUTIVO =
  'SELECT reservar_consecutivo_prestador($1::uuid, $2, $3) AS consecutivo'

let schemaReady = null

export function assertReservaConsecutivo(input = {}) {
  const usuarioTitularId = String(input.usuarioTitularId ?? '').trim()
  if (!UUID_RE.test(usuarioTitularId)) {
    throw new Error('usuario_titular_id debe ser un UUID del titular.')
  }

  const tipoDocumento = String(input.tipoDocumento ?? '').trim()
  if (!TIPOS.has(tipoDocumento)) {
    throw new Error('tipo_documento debe ser RECIBO_CAJA o CUENTA_COBRO.')
  }

  const prefijo = String(input.prefijo ?? 'RC-').trim() || 'RC-'
  if (prefijo.length > 10) {
    throw new Error('El prefijo del consecutivo no puede superar 10 caracteres.')
  }

  return { usuarioTitularId, tipoDocumento, prefijo }
}

export async function ensureCobroSchema() {
  if (!schemaReady) {
    schemaReady = withPgClient(async (client) => {
      for (const file of MIGRATION_FILES) {
        const sql = await readFile(file, 'utf8')
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
      }
    }).catch((error) => {
      schemaReady = null
      throw error
    })
  }
  return schemaReady
}

async function ejecutarReserva(client, reserva) {
  const { rows } = await client.query(SQL_RESERVAR_CONSECUTIVO, [
    reserva.usuarioTitularId,
    reserva.tipoDocumento,
    reserva.prefijo,
  ])
  const consecutivo = Number(rows[0]?.consecutivo)
  if (!Number.isInteger(consecutivo) || consecutivo < 1) {
    throw new Error('No se pudo reservar el consecutivo del titular.')
  }
  return consecutivo
}

/**
 * Reserva el siguiente consecutivo del titular.
 * Si se pasa un cliente, el incremento participa en su transacción
 * (así un recibo revertido no deja hueco). Sin cliente, la reserva se confirma sola.
 * @param {{ usuarioTitularId: string, tipoDocumento: string, prefijo?: string }} input
 * @param {{ query: Function }} [client]
 * @returns {Promise<number>}
 */
export async function reservarConsecutivoPrestador(input, client) {
  const reserva = assertReservaConsecutivo(input)
  await ensureCobroSchema()
  if (client) return ejecutarReserva(client, reserva)
  return withPgClient((dbClient) => ejecutarReserva(dbClient, reserva))
}
