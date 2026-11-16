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

function clinicIdCanonico(explicit?: string | null): string {
  return String(explicit || getCurrentClinicId() || '').trim()
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

async function yaExisteCuv(cuv: string): Promise<boolean> {
  const codigo = cuv.trim()
  if (!codigo) return false
  const rows = await db.rips_submissions.toArray()
  return rows.some((row) => String(row.cuv ?? '').trim() === codigo)
}

/**
 * Inserta una radicación en `rips_submissions`.
 * El id es un UUID nuevo. No modifica pacientes ni historias clínicas.
 * `clinicId` queda siempre en la clave canónica de sesión (`clinic:…`).
 */
export async function registrarRadicacionRips(
  input: RegistrarRadicacionRipsInput,
): Promise<string> {
  const clinicId = clinicIdCanonico(input.clinicId)
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

/**
 * Igual que `registrarRadicacionRips`, pero omite el alta si el CUV ya está
 * en el historial (evita duplicar al reconciliar notas ya radicadas).
 */
export async function registrarRadicacionRipsSiNueva(
  input: RegistrarRadicacionRipsInput,
): Promise<string | null> {
  const cuv = input.cuv?.trim() ?? ''
  if (cuv && (await yaExisteCuv(cuv))) return null
  return registrarRadicacionRips(input)
}

/** Guarda el historial sin interrumpir la radicación si IndexedDB falla. */
export function guardarHistorialRadicacionRips(input: RegistrarRadicacionRipsInput): void {
  void registrarRadicacionRipsSiNueva(input).catch((error) => {
    console.error('No se pudo guardar el historial local de radicación RIPS.', error)
  })
}

/**
 * Recupera radicaciones que quedaron solo en la nota/historia (CUV + enviado_ok)
 * y nunca se escribieron en `rips_submissions` (p. ej. envío desde evolución).
 */
export async function reconciliarHistorialRipsDesdeHistorias(): Promise<number> {
  const clinicId = clinicIdCanonico()
  const existing = new Set(
    (await db.rips_submissions.toArray())
      .map((row) => String(row.cuv ?? '').trim())
      .filter(Boolean),
  )

  let added = 0

  const registrarSiFalta = async (input: {
    cuv: string
    fecha?: string | null
    cantidad?: number
    payload: unknown
  }) => {
    const cuv = input.cuv.trim()
    if (!cuv || existing.has(cuv)) return
    await registrarRadicacionRips({
      cuv,
      cantidad_historias: input.cantidad && input.cantidad > 0 ? input.cantidad : 1,
      estado: 'radicado',
      payload_json: input.payload,
      fecha_radicacion: input.fecha?.trim() || new Date().toISOString(),
      clinicId,
    })
    existing.add(cuv)
    added += 1
  }

  for (const record of await db.clinicalRecords.toArray()) {
    if (!belongsToCurrentClinic(record) && record.clinicId) continue

    const recordCuv = String((record as { cuv?: string | null }).cuv ?? '').trim()
    const estadoMuv = String((record as { estadoMuv?: string | null }).estadoMuv ?? '').trim()
    if (recordCuv && estadoMuv === 'APROBADO') {
      await registrarSiFalta({
        cuv: recordCuv,
        fecha: record.signedAt ?? record.updatedAt ?? record.createdAt,
        payload: {
          reconciliado: true,
          origen: 'historia',
          clinicalRecordId: record.id ?? null,
        },
      })
    }

    for (const note of record.evolutionNotes ?? []) {
      const meta = note.ripsMetadata
      const cuv = String(meta?.cuv ?? '').trim()
      const estado = String(meta?.ripsEstado ?? '').trim()
      if (!cuv || estado !== 'enviado_ok') continue
      await registrarSiFalta({
        cuv,
        fecha: meta?.ripsFechaTransmision ?? note.signedAt ?? note.date,
        payload: {
          reconciliado: true,
          origen: 'nota',
          noteId: note.id,
          clinicalRecordId: record.id ?? null,
        },
      })
    }
  }

  for (const draft of await db.patientClinicalDrafts.toArray()) {
    const fuentes = [
      draft.evolutionNotes,
      draft.clinicalDraft?.evolutionNotes,
      draft.valuationDraft?.evolutionNotes,
    ]
    for (const notes of fuentes) {
      for (const note of notes ?? []) {
        const meta = note.ripsMetadata
        const cuv = String(meta?.cuv ?? '').trim()
        const estado = String(meta?.ripsEstado ?? '').trim()
        if (!cuv || estado !== 'enviado_ok') continue
        await registrarSiFalta({
          cuv,
          fecha: meta?.ripsFechaTransmision ?? note.signedAt ?? note.date,
          payload: {
            reconciliado: true,
            origen: 'borrador',
            noteId: note.id,
            patientId: draft.patientId,
          },
        })
      }
    }
  }

  return added
}

export async function listarRadicacionesRips(): Promise<RipsSubmission[]> {
  const rows = await db.rips_submissions.orderBy('fecha_radicacion').reverse().toArray()
  return rows.filter((row) => belongsToCurrentClinic(row))
}
