import type { EvolutionNote } from '@/types/evolutionNote'

/**
 * Cuerpo clínico que entra al SHA-256 de la nota (Ley 527 / Res. 1995/1999).
 * El cobro y `ripsMetadata` quedan fuera: un recibo, una FEV o un CUV
 * posteriores no invalidan la firma.
 */
export function buildEvolutionNoteHashPayload(note: EvolutionNote) {
  return {
    id: note.id,
    kind: note.kind ?? 'evolution',
    parentEvolutionNoteId: note.parentEvolutionNoteId ?? null,
    parentEvolutionNoteHash: note.parentEvolutionNoteHash ?? null,
    addendumReason: note.addendumReason ?? null,
    date: note.date,
    procedure: note.procedure,
    toothNumber: note.toothNumber ?? null,
    anatomicalScope: note.anatomicalScope ?? null,
    diagnoses: note.diagnoses ?? null,
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
