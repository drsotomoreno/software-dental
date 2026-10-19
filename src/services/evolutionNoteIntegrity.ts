import type { EvolutionNote } from '../types/evolutionNote.ts'
import { computeContentHash, serializeForHash } from '../utils/crypto.ts'

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

export async function computeEvolutionNoteContentHash(note: EvolutionNote): Promise<string> {
  return computeContentHash(serializeForHash(buildEvolutionNoteHashPayload(note)))
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
    status: 'firmada',
    isSigned: true,
    signedBy: note.signedBy ?? note.authorUserId ?? note.professionalLicense ?? '',
    signatureData: note.signatureData ?? note.professionalSignatureDataUrl ?? '',
  }
}
