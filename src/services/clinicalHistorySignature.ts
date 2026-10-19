import type { ClinicalRecord, HistoriaClinicaApertura } from '../types/clinicalRecord.ts'
import type { EvolutionNote } from '../types/evolutionNote.ts'
import {
  EvolutionNoteImmutableError,
  isEvolutionNoteImmutable,
} from '../types/evolutionNote.ts'
import { finalizeEvolutionNote } from './evolutionNoteIntegrity.ts'

export interface FirmaApertura {
  signedAt: string
  signatureData: string
  signedBy: string
  signedByName?: string
  contentHash?: string
}

export interface FirmaEvolucion {
  signedAt: string
  signatureData: string
  signedBy: string
}

export interface AperturaLeida {
  recordId?: string
  signedAt: string
  signatureData: string
  isSigned: true
  signedBy: string
  signedByName?: string
  contentHash?: string
  origen: 'apertura' | 'legado'
}

type RegistroApertura = Pick<
  ClinicalRecord,
  | 'id'
  | 'isLocked'
  | 'signedAt'
  | 'isSigned'
  | 'signedBy'
  | 'signatureData'
  | 'apertura'
  | 'professionalId'
  | 'contentHash'
> & {
  informedConsent?: { professionalSignatureDataUrl?: string }
}

type AperturaFirmable = {
  isSigned?: boolean
  signedAt?: string
  signedBy?: string
  signatureData?: string
  contentHash?: string
  apertura?: HistoriaClinicaApertura
  evolutionNotes?: EvolutionNote[]
}

export class HistoriaAperturaYaFirmadaError extends Error {
  readonly signedAt: string

  constructor(signedAt: string) {
    super(
      `La historia clínica ya fue firmada el ${signedAt}. Para la atención de hoy firme la evolución. Esa firma no modifica la apertura.`,
    )
    this.name = 'HistoriaAperturaYaFirmadaError'
    this.signedAt = signedAt
  }
}

function instanteApertura(record: RegistroApertura): string {
  return record.apertura?.signedAt ?? record.signedAt ?? ''
}

/** La apertura es el registro firmado más antiguo. Un cierre posterior no la reemplaza. */
export function leerApertura(records: readonly RegistroApertura[]): AperturaLeida | null {
  const explicitas = records.filter((record) => record.apertura?.isSigned === true || record.isSigned === true)
  const pool =
    explicitas.length > 0
      ? explicitas
      : records.filter((record) => record.isLocked && Boolean(record.signedAt))
  if (pool.length === 0) return null

  const oldest = [...pool].sort(
    (a, b) => new Date(instanteApertura(a)).getTime() - new Date(instanteApertura(b)).getTime(),
  )[0]
  const signedAt = instanteApertura(oldest)
  if (!signedAt) return null

  const explicita = oldest.apertura?.isSigned === true || oldest.isSigned === true
  return {
    recordId: oldest.id != null ? String(oldest.id) : undefined,
    signedAt,
    signatureData:
      oldest.apertura?.signatureData ??
      oldest.signatureData ??
      oldest.informedConsent?.professionalSignatureDataUrl ??
      '',
    isSigned: true,
    signedBy: oldest.apertura?.signedBy ?? oldest.signedBy ?? oldest.professionalId ?? '',
    signedByName: oldest.apertura?.signedByName,
    contentHash: oldest.apertura?.contentHash ?? oldest.contentHash,
    origen: explicita ? 'apertura' : 'legado',
  }
}

/**
 * Firma la apertura una sola vez.
 * No finaliza evoluciones y no modifica las que ya vengan en el documento.
 */
export function firmarAperturaHistoria<T extends AperturaFirmable>(
  record: T,
  firma: FirmaApertura,
): T {
  if (record.apertura?.isSigned || record.isSigned === true) {
    throw new HistoriaAperturaYaFirmadaError(record.apertura?.signedAt ?? record.signedAt ?? firma.signedAt)
  }

  const apertura: HistoriaClinicaApertura = {
    isSigned: true,
    signedAt: firma.signedAt,
    signatureData: firma.signatureData,
    signedBy: firma.signedBy,
    signedByName: firma.signedByName,
    contentHash: firma.contentHash ?? record.contentHash,
  }

  return {
    ...record,
    isSigned: true,
    signedBy: firma.signedBy,
    signatureData: firma.signatureData,
    signedAt: record.signedAt ?? firma.signedAt,
    apertura,
    evolutionNotes: record.evolutionNotes,
  }
}

/**
 * Firma una evolución concreta.
 * El resto del arreglo, incluida cualquier otra nota, no cambia.
 */
export async function firmarEvolucion(
  notes: EvolutionNote[],
  evolucionId: string,
  firma: FirmaEvolucion,
): Promise<EvolutionNote[]> {
  const index = notes.findIndex((note) => note.id === evolucionId)
  if (index < 0) {
    throw new Error('La evolución no existe.')
  }

  const target = notes[index]
  if (isEvolutionNoteImmutable(target)) {
    throw new EvolutionNoteImmutableError()
  }

  const signatureData = firma.signatureData || target.signatureData || target.professionalSignatureDataUrl || ''
  const finalized = await finalizeEvolutionNote(
    {
      ...target,
      signedBy: firma.signedBy,
      signatureData,
      professionalSignatureDataUrl: target.professionalSignatureDataUrl || signatureData || undefined,
    },
    firma.signedAt,
  )

  const signed: EvolutionNote = {
    ...finalized,
    status: 'firmada',
    isSigned: true,
    isLocked: true,
    signedBy: firma.signedBy,
    signatureData,
  }

  return notes.map((note, noteIndex) => (noteIndex === index ? signed : note))
}

/** La firma de la evolución devuelve la misma apertura, sin cambiar su fecha ni su trazo. */
export async function firmarEvolucionSinAlterarApertura(input: {
  apertura: HistoriaClinicaApertura
  notes: EvolutionNote[]
  evolucionId: string
  firma: FirmaEvolucion
}): Promise<{ apertura: HistoriaClinicaApertura; notes: EvolutionNote[] }> {
  const notes = await firmarEvolucion(input.notes, input.evolucionId, input.firma)
  return { apertura: input.apertura, notes }
}

export function textoEstadoEvolucion(
  note: Pick<EvolutionNote, 'isLocked' | 'signedAt' | 'contentHash' | 'status' | 'isSigned'>,
): 'Firmada' | 'Pendiente de firma' {
  return isEvolutionNoteImmutable(note) ? 'Firmada' : 'Pendiente de firma'
}

/** Conserva la versión firmada cuando el mismo id aparece en varios snapshots. */
export function deduplicarEvoluciones(
  groups: readonly (readonly EvolutionNote[] | null | undefined)[],
): EvolutionNote[] {
  const byId = new Map<string, EvolutionNote>()
  for (const group of groups) {
    if (!Array.isArray(group)) continue
    for (const note of group) {
      if (!note?.id) continue
      const current = byId.get(note.id)
      if (!current || (!isEvolutionNoteImmutable(current) && isEvolutionNoteImmutable(note))) {
        byId.set(note.id, note)
      }
    }
  }
  return [...byId.values()].sort(
    (a, b) => new Date(b.date || b.createdAt).getTime() - new Date(a.date || a.createdAt).getTime(),
  )
}

/**
 * Sustituye borradores locales por la evolución ya firmada y agrega las que solo están en la tabla hija.
 * Devuelve el mismo arreglo cuando no hay nada que cambiar.
 */
export function fusionarEvolucionesFirmadas(
  notes: EvolutionNote[],
  firmadas: readonly EvolutionNote[],
): EvolutionNote[] {
  const pendientes = new Map(
    firmadas.filter((note) => note.id && isEvolutionNoteImmutable(note)).map((note) => [note.id, note]),
  )
  if (pendientes.size === 0) return notes

  let changed = false
  const merged = notes.map((note) => {
    const signed = pendientes.get(note.id)
    if (!signed) return note
    pendientes.delete(note.id)
    if (
      isEvolutionNoteImmutable(note) &&
      note.contentHash === signed.contentHash &&
      note.status === 'firmada' &&
      note.isSigned === true
    ) {
      return note
    }
    changed = true
    return {
      ...note,
      ...signed,
      status: 'firmada' as const,
      isSigned: true,
      isLocked: true,
    }
  })

  for (const extra of pendientes.values()) {
    changed = true
    merged.push({ ...extra, status: 'firmada', isSigned: true, isLocked: true })
  }

  return changed ? merged : notes
}
