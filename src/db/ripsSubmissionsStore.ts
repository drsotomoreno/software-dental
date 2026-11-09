import { db } from '@/db/database'
import { belongsToCurrentClinic } from '@/services/clinicLocalIsolation'
import { getCurrentClinicId } from '@/services/clinicalSyncState'
import type { RipsSubmission } from '@/types/ripsSubmission'
import { generateId } from '@/utils'

export interface RegistrarRadicacionRipsInput {
  cuv?: string | null
  cantidad_historias: number
  estado: string
  /** Objeto RIPS tal como se envió. Se clona antes de persistir. */
  payload_json: unknown
  fecha_radicacion?: string
  clinicId?: string | null
}

function clonarPayloadJson(payload: unknown): unknown {
  return JSON.parse(JSON.stringify(payload ?? null)) as unknown
}

/** Consultas, procedimientos y demás servicios del JSON RIPS enviado. */
export function contarAtencionesEnviadas(payload: unknown): number {
  if (!payload || typeof payload !== 'object') return 0
  const usuarios = (payload as { usuarios?: unknown }).usuarios
  if (!Array.isArray(usuarios)) return 0
  let total = 0
  for (const usuario of usuarios) {
    if (!usuario || typeof usuario !== 'object') continue
    const servicios = (usuario as { servicios?: unknown }).servicios
    if (!servicios || typeof servicios !== 'object') continue
    for (const value of Object.values(servicios)) {
      if (Array.isArray(value)) total += value.length
    }
  }
  return total
}

/**
 * Inserta una radicación en `rips_submissions`.
 * El id es un UUID nuevo. No modifica pacientes ni historias clínicas.
 */
export async function registrarRadicacionRips(
  input: RegistrarRadicacionRipsInput,
): Promise<string> {
  const clinicId = String(input.clinicId || getCurrentClinicId() || '').trim()
  const row: RipsSubmission = {
    id: generateId(),
    fecha_radicacion: input.fecha_radicacion ?? new Date().toISOString(),
    cuv: input.cuv?.trim() ?? '',
    cantidad_historias: input.cantidad_historias,
    estado: input.estado,
    payload_json: clonarPayloadJson(input.payload_json),
    ...(clinicId ? { clinicId } : {}),
  }
  await db.rips_submissions.add(row)
  return row.id
}

/** Guarda el historial sin interrumpir la radicación si IndexedDB falla. */
export function guardarHistorialRadicacionRips(input: RegistrarRadicacionRipsInput): void {
  void registrarRadicacionRips(input).catch((error) => {
    console.error('No se pudo guardar el historial local de radicación RIPS.', error)
  })
}

export async function listarRadicacionesRips(): Promise<RipsSubmission[]> {
  const rows = await db.rips_submissions.orderBy('fecha_radicacion').reverse().toArray()
  return rows.filter((row) => belongsToCurrentClinic(row))
}
