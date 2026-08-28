import { db } from '@/db/database'
import type { EvolutionNote } from '@/types/evolutionNote'
import {
  EVOLUTION_NOTE_IMMUTABILITY_MESSAGE,
  isEvolutionNoteImmutable,
} from '@/types/evolutionNote'
import type { EvolutionNoteAddendum } from '@/types/evolutionNoteAddendum'
import type { SyncOutboxEntityType, SyncOutboxEntry } from '@/types/syncOutbox'
import { computeContentHash, generateId, serializeForHash } from '@/utils'

export class EvolutionNoteImmutableError extends Error {
  constructor(message = EVOLUTION_NOTE_IMMUTABILITY_MESSAGE) {
    super(message)
    this.name = 'EvolutionNoteImmutableError'
  }
}

export function assertEvolutionNoteMutable(
  note: Pick<EvolutionNote, 'id' | 'signedAt' | 'contentHash' | 'isLocked'>,
): void {
  if (isEvolutionNoteImmutable(note)) {
    throw new EvolutionNoteImmutableError()
  }
}

/** Payload canónico para hash SHA-256 de una nota de evolución. */
export function buildEvolutionNoteHashPayload(note: EvolutionNote) {
  return {
    id: note.id,
    kind: note.kind ?? 'evolution',
    parentEvolutionNoteId: note.parentEvolutionNoteId ?? null,
    parentEvolutionNoteHash: note.parentEvolutionNoteHash ?? null,
    addendumReason: note.addendumReason ?? null,
    date: note.date,
    procedure: note.procedure,
    anesthesia: note.anesthesia,
    prescriptions: note.prescriptions,
    professionalName: note.professionalName,
    professionalLicense: note.professionalLicense,
    authorUserId: note.authorUserId ?? null,
    authorEmail: note.authorEmail ?? null,
    createdAt: note.createdAt,
    catalogServices: note.catalogServices ?? null,
    dentalServiceId: note.dentalServiceId ?? null,
    serviceName: note.serviceName ?? null,
    requiereCupsRips: note.requiereCupsRips ?? null,
    clinicalNote: note.clinicalNote ?? null,
    cupsCode: note.cupsCode ?? null,
    professionalSignatureDataUrl: note.professionalSignatureDataUrl ?? null,
    professionalSignatureMeta: note.professionalSignatureMeta ?? null,
    cost: note.cost ?? null,
    isBillable: note.isBillable ?? null,
  }
}

export function buildEvolutionAddendumHashPayload(
  addendum: Omit<EvolutionNoteAddendum, 'contentHash'>,
) {
  return {
    id: addendum.id,
    patientId: addendum.patientId,
    parentRecordId: addendum.parentRecordId ?? null,
    parentEvolutionNoteId: addendum.parentEvolutionNoteId,
    parentEvolutionNoteHash: addendum.parentEvolutionNoteHash,
    reason: addendum.reason,
    content: addendum.content,
    authorUserId: addendum.authorUserId,
    authorEmail: addendum.authorEmail,
    authorName: addendum.authorName,
    authorDocument: addendum.authorDocument,
    professionalLicense: addendum.professionalLicense ?? null,
    professionalSignatureDataUrl: addendum.professionalSignatureDataUrl,
    professionalSignatureMeta: addendum.professionalSignatureMeta,
    signedAt: addendum.signedAt,
    createdAt: addendum.createdAt,
    deviceInfo: addendum.deviceInfo ?? null,
    ipAddress: addendum.ipAddress ?? null,
    timezone: addendum.timezone ?? null,
  }
}

export async function computeEvolutionNoteContentHash(note: EvolutionNote): Promise<string> {
  return computeContentHash(serializeForHash(buildEvolutionNoteHashPayload(note)))
}

export async function computeEvolutionAddendumContentHash(
  addendum: Omit<EvolutionNoteAddendum, 'contentHash'>,
): Promise<string> {
  return computeContentHash(serializeForHash(buildEvolutionAddendumHashPayload(addendum)))
}

/** Marca la nota como grabada/firmada con timestamp UTC y hash SHA-256. */
export async function finalizeEvolutionNote(
  note: EvolutionNote,
  signedAtUtc = new Date().toISOString(),
): Promise<EvolutionNote> {
  const contentHash = await computeEvolutionNoteContentHash(note)
  return {
    ...note,
    signedAt: signedAtUtc,
    contentHash,
    isLocked: true,
  }
}

export async function finalizeEvolutionNotes(
  notes: EvolutionNote[],
  signedAtUtc = new Date().toISOString(),
): Promise<EvolutionNote[]> {
  return Promise.all(
    notes.map(async (note) =>
      isEvolutionNoteImmutable(note) ? note : finalizeEvolutionNote(note, signedAtUtc),
    ),
  )
}

export function updateEvolutionNoteInList(
  notes: EvolutionNote[],
  noteId: string,
  patch: Partial<EvolutionNote>,
): EvolutionNote[] {
  const target = notes.find((note) => note.id === noteId)
  if (!target) return notes
  assertEvolutionNoteMutable(target)
  return notes.map((note) => (note.id === noteId ? { ...note, ...patch } : note))
}

export function removeEvolutionNoteFromList(
  notes: EvolutionNote[],
  noteId: string,
): EvolutionNote[] {
  const target = notes.find((note) => note.id === noteId)
  if (!target) return notes
  assertEvolutionNoteMutable(target)
  return notes.filter((note) => note.id !== noteId)
}

export function createAddendumDraftNote(
  parent: EvolutionNote,
  professionalName: string,
  professionalLicense: string,
  authorUserId: string,
  authorEmail: string,
): EvolutionNote {
  return {
    id: generateId(),
    kind: 'addendum',
    parentEvolutionNoteId: parent.id,
    parentEvolutionNoteHash: parent.contentHash,
    addendumReason: '',
    date: new Date().toISOString().slice(0, 16),
    procedure: `Aclaratoria — ${parent.serviceName || parent.procedure || 'Evolución'}`,
    anesthesia: { type: '', carpules: 0, vasoconstrictor: '' },
    prescriptions: '',
    professionalName,
    professionalLicense,
    authorUserId: authorUserId || undefined,
    authorEmail: authorEmail || undefined,
    createdAt: new Date().toISOString(),
    clinicalNote: '',
    requiereCupsRips: false,
    isLocked: false,
  }
}

/** Rechaza mutaciones UPDATE/DELETE en la cola — solo CREATE permitido. */
export function assertOutboxCreateOnly(action: string): void {
  if (action !== 'CREATE') {
    throw new Error(
      'Operación no permitida: las evoluciones clínicas solo admiten inserciones (CREATE) según Res. 1995/1999.',
    )
  }
}

/** Cola de sincronización: solo INSERT (action CREATE). */
export async function enqueueEvolutionOutboxCreate(
  patientId: string,
  entityType: SyncOutboxEntityType,
  evolutionNoteId: string,
  payload: EvolutionNote | EvolutionNoteAddendum,
): Promise<void> {
  assertOutboxCreateOnly('CREATE')
  const entry: SyncOutboxEntry = {
    id: generateId(),
    entityType,
    action: 'CREATE',
    patientId,
    evolutionNoteId,
    payload,
    createdAt: new Date().toISOString(),
  }
  await db.syncOutbox.add(entry)
}

export async function ensureEvolutionNoteOutboxCreate(
  patientId: string,
  note: EvolutionNote,
): Promise<void> {
  const existing = await db.syncOutbox.where('evolutionNoteId').equals(note.id).count()
  if (existing > 0) return
  const entityType =
    note.kind === 'addendum' ? 'evolution_note_addendum' : 'evolution_note'
  await enqueueEvolutionOutboxCreate(patientId, entityType, note.id, note)
}

export async function persistEvolutionNoteAddendum(
  addendum: EvolutionNoteAddendum,
): Promise<void> {
  await db.evolutionNoteAddendums.add(addendum)
  await enqueueEvolutionOutboxCreate(
    addendum.patientId,
    'evolution_note_addendum',
    addendum.id,
    addendum,
  )
}

export async function persistSignedEvolutionNoteCreate(
  patientId: string,
  note: EvolutionNote,
): Promise<EvolutionNote> {
  const signed = await finalizeEvolutionNote(note)
  const entityType =
    signed.kind === 'addendum' ? 'evolution_note_addendum' : 'evolution_note'
  await enqueueEvolutionOutboxCreate(patientId, entityType, signed.id, signed)
  return signed
}
