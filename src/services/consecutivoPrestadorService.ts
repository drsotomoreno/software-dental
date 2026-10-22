import { db } from '@/db/database'
import type { ConsecutivoPrestador, ReciboCaja, TipoDocumentoCobro } from '@/types/atencionPago'
import { generateId } from '@/utils'
import {
  assertTipoDocumentoCobro,
  normalizarPrefijo,
  normalizarValorProcedimiento,
  numeroSoportePago,
  PREFIJO_RECIBO_CAJA,
  siguienteConsecutivo,
} from '@/utils/atencionPago'

export interface ReservaConsecutivo {
  consecutivo: number
  prefijo: string
  numeroSoporte: string
}

export interface EmitirReciboCajaInput {
  usuarioTitularId: string
  tipoDocumento?: TipoDocumentoCobro
  prefijo?: string
  concepto?: string
  valor?: number
  id?: string
}

function assertTitular(usuarioTitularId: string): string {
  const id = String(usuarioTitularId ?? '').trim()
  if (!id) throw new Error('usuario_titular_id es obligatorio.')
  return id
}

/**
 * Reserva el siguiente consecutivo del titular dentro de la transacción activa.
 * Dos tipos de documento del mismo titular no comparten la secuencia.
 */
export async function reservarConsecutivoTitular(input: {
  usuarioTitularId: string
  tipoDocumento: TipoDocumentoCobro
  prefijo?: string
}): Promise<ReservaConsecutivo> {
  const usuarioTitularId = assertTitular(input.usuarioTitularId)
  const tipoDocumento = assertTipoDocumentoCobro(input.tipoDocumento)
  const prefijo = normalizarPrefijo(input.prefijo ?? PREFIJO_RECIBO_CAJA)

  return db.transaction('rw', db.consecutivosPrestador, async () => {
    const existing = await db.consecutivosPrestador
      .where('[usuarioTitularId+tipoDocumento]')
      .equals([usuarioTitularId, tipoDocumento])
      .first()

    const consecutivo = siguienteConsecutivo(existing?.ultimoConsecutivo)
    const now = new Date().toISOString()
    const row: ConsecutivoPrestador = {
      id: existing?.id ?? generateId(),
      usuarioTitularId,
      tipoDocumento,
      prefijo,
      ultimoConsecutivo: consecutivo,
      updatedAt: now,
    }

    await db.consecutivosPrestador.put(row)
    return {
      consecutivo,
      prefijo,
      numeroSoporte: numeroSoportePago(prefijo, consecutivo),
    }
  })
}

/**
 * Reserva el consecutivo y graba el recibo en la misma transacción local.
 * Si el recibo no se puede guardar, el consecutivo no avanza.
 */
export async function emitirReciboCaja(input: EmitirReciboCajaInput): Promise<ReciboCaja> {
  const usuarioTitularId = assertTitular(input.usuarioTitularId)
  const tipoDocumento = assertTipoDocumentoCobro(input.tipoDocumento ?? 'RECIBO_CAJA')
  const prefijo = normalizarPrefijo(input.prefijo ?? PREFIJO_RECIBO_CAJA)

  return db.transaction('rw', db.consecutivosPrestador, db.recibosCaja, async () => {
    const reserva = await reservarConsecutivoTitular({
      usuarioTitularId,
      tipoDocumento,
      prefijo,
    })
    const recibo: ReciboCaja = {
      id: input.id?.trim() || generateId(),
      usuarioTitularId,
      tipoDocumento,
      consecutivo: reserva.consecutivo,
      prefijo: reserva.prefijo,
      numeroSoporte: reserva.numeroSoporte,
      concepto: input.concepto?.trim() || undefined,
      valor: normalizarValorProcedimiento(input.valor ?? 0),
      createdAt: new Date().toISOString(),
    }
    await db.recibosCaja.add(recibo)
    return recibo
  })
}
