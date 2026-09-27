import { db } from '@/db/database'
import type { RipsValidadorRecord, SaveRipsValidadorInput } from '@/types/ripsValidador'
import { validarEstructuraRips, type PaqueteRIPS } from '@/utils/ripsValidator'
import {
  mapearRipsParaValidador,
  normalizarDocumentoRipsValidador,
  type RipsValidadorContexto,
  type RipsValidadorDocumento,
} from '../../shared/ripsValidadorMap.js'

function nowIso() {
  return new Date().toISOString()
}

/**
 * Guarda el JSON del formulario en Dexie y devuelve el paquete que exige el validador.
 */
export async function guardarRipsValidador(input: SaveRipsValidadorInput): Promise<{
  isValid: boolean
  errors: string[]
  registro: RipsValidadorRecord | null
  documento: RipsValidadorDocumento
  rips: ReturnType<typeof mapearRipsParaValidador> | null
}> {
  const documento = normalizarDocumentoRipsValidador(input.documento ?? input)
  const estructura = validarEstructuraRips({
    ...documento,
    numFactura: documento.numFactura ?? '',
  } as PaqueteRIPS)
  if (!estructura.isValid) {
    return { isValid: false, errors: estructura.errors, registro: null, documento, rips: null }
  }

  const id = input.id?.trim() || crypto.randomUUID()
  const previous = await db.ripsValidador.get(id)
  const registro: RipsValidadorRecord = {
    id,
    clinicId: input.clinicId ?? previous?.clinicId ?? null,
    patientId: input.patientId ?? previous?.patientId ?? null,
    profesional: input.profesional ?? previous?.profesional ?? null,
    documento,
    createdAt: previous?.createdAt ?? nowIso(),
    updatedAt: nowIso(),
  }
  await db.ripsValidador.put(registro)
  return {
    isValid: true,
    errors: [],
    registro,
    documento,
    rips: mapearRipsParaValidador(documento, { profesional: registro.profesional ?? undefined }),
  }
}

export async function listarRipsValidador(clinicId?: string | null): Promise<RipsValidadorRecord[]> {
  const rows = clinicId
    ? await db.ripsValidador.where('clinicId').equals(clinicId).toArray()
    : await db.ripsValidador.toArray()
  return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export function obtenerRipsValidador(id: string): Promise<RipsValidadorRecord | undefined> {
  return db.ripsValidador.get(id)
}

export function mapearRegistroRipsValidador(registro: RipsValidadorRecord, contexto?: RipsValidadorContexto) {
  return mapearRipsParaValidador(registro.documento, {
    profesional: registro.profesional ?? undefined,
    ...contexto,
  })
}
