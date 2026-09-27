import { db } from '@/db/database'
import type { EstadoValidacionRips, LocalRipsRecord } from '@/db/localRipsDatabase'
import { validarEstructuraRips, type PaqueteRIPS } from '@/utils/ripsValidator'

export interface GuardarRipsLocalInput {
  id?: number
  numFactura: string
  numDocumentoIdObligado: string
  tipoNota?: string | null
  /** Objeto del formulario o JSON ya serializado. */
  payload: PaqueteRIPS | string
  cuv?: string
  /** `PENDIENTE` guarda el borrador sin pasar por el validador. */
  estadoValidacion?: EstadoValidacionRips
}

function serializarPayload(payload: PaqueteRIPS | string): string {
  return typeof payload === 'string' ? payload : JSON.stringify(payload)
}

function leerPayload(payloadJson: string): PaqueteRIPS | null {
  try {
    const parsed = JSON.parse(payloadJson) as PaqueteRIPS
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

/**
 * Persiste el paquete y el resultado de `validarEstructuraRips`.
 * Un JSON inválido queda en `RECHAZADO` para poder corregirlo.
 */
export async function guardarRipsLocal(input: GuardarRipsLocalInput): Promise<{
  record: LocalRipsRecord
  isValid: boolean
  errors: string[]
}> {
  const payloadJson = serializarPayload(input.payload)
  const paquete = leerPayload(payloadJson)
  let errors: string[] = []
  let estado: EstadoValidacionRips = input.estadoValidacion ?? 'PENDIENTE'

  if (input.estadoValidacion === 'PENDIENTE') {
    estado = 'PENDIENTE'
  } else if (!paquete) {
    estado = 'RECHAZADO'
    errors = ['El payloadJson no es un JSON de RIPS interpretable.']
  } else {
    const estructura = validarEstructuraRips(paquete)
    errors = estructura.errors
    estado = estructura.isValid ? 'VALIDO' : 'RECHAZADO'
  }

  const previous = input.id != null ? await db.ripsRecords.get(input.id) : undefined
  const record: LocalRipsRecord = {
    id: input.id,
    numFactura: input.numFactura,
    numDocumentoIdObligado: input.numDocumentoIdObligado,
    tipoNota: input.tipoNota ?? null,
    payloadJson,
    estadoValidacion: estado,
    cuv: input.cuv ?? previous?.cuv,
    createdAt: previous?.createdAt ?? new Date(),
  }
  const id = await db.ripsRecords.put(record)
  return {
    record: { ...record, id },
    isValid: estado === 'VALIDO',
    errors,
  }
}

export async function listarRipsLocales(estado?: EstadoValidacionRips): Promise<LocalRipsRecord[]> {
  const rows = estado
    ? await db.ripsRecords.where('estadoValidacion').equals(estado).toArray()
    : await db.ripsRecords.toArray()
  return rows.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
}

export async function listarRipsLocalesPorFactura(numFactura: string): Promise<LocalRipsRecord[]> {
  return db.ripsRecords.where('numFactura').equals(numFactura).toArray()
}

export async function asignarCuvRipsLocal(id: number, cuv: string): Promise<LocalRipsRecord | undefined> {
  const current = await db.ripsRecords.get(id)
  if (!current) return undefined
  const next = { ...current, cuv }
  await db.ripsRecords.put(next)
  return next
}
