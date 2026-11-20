import type { EvolutionNote } from '@/types/evolutionNote'
import {
  isRecoveredEvolutionNoteId,
  stripRecoveredEvolutionNoteIdForHash,
} from '../../shared/evolutionNoteIds.js'

/**
 * Cuerpo clínico que entra al SHA-256 de la nota (Ley 527 / Res. 1995/1999).
 * El cobro y `ripsMetadata` quedan fuera: un recibo, una FEV o un CUV
 * posteriores no invalidan la firma.
 *
 * Ids `recovered-*` (legado sin id) se omiten: el sello original no incluía
 * esa clave (undefined → omitido en JSON.stringify).
 */
export function buildEvolutionNoteHashPayload(note: EvolutionNote) {
  const clinical = stripRecoveredEvolutionNoteIdForHash(note) as EvolutionNote
  const id = String(clinical.id ?? '').trim()
  const includeId = Boolean(id) && !isRecoveredEvolutionNoteId(id)

  return {
    ...(includeId ? { id } : {}),
    kind: clinical.kind ?? 'evolution',
    parentEvolutionNoteId: clinical.parentEvolutionNoteId ?? null,
    parentEvolutionNoteHash: clinical.parentEvolutionNoteHash ?? null,
    addendumReason: clinical.addendumReason ?? null,
    date: clinical.date,
    procedure: clinical.procedure,
    toothNumber: clinical.toothNumber ?? null,
    anatomicalScope: clinical.anatomicalScope ?? null,
    diagnoses: clinical.diagnoses ?? null,
    anesthesia: clinical.anesthesia,
    prescriptions: clinical.prescriptions,
    professionalName: clinical.professionalName,
    professionalLicense: clinical.professionalLicense,
    ...(clinical.rethusFirma ? { rethusFirma: clinical.rethusFirma } : {}),
    authorUserId: clinical.authorUserId ?? null,
    authorEmail: clinical.authorEmail ?? null,
    createdAt: clinical.createdAt,
    catalogServices: clinical.catalogServices ?? null,
    dentalServiceId: clinical.dentalServiceId ?? null,
    serviceName: clinical.serviceName ?? null,
    requiereCupsRips: clinical.requiereCupsRips ?? null,
    clinicalNote: clinical.clinicalNote ?? null,
    cupsCode: clinical.cupsCode ?? null,
    professionalSignatureDataUrl: clinical.professionalSignatureDataUrl ?? null,
    professionalSignatureMeta: clinical.professionalSignatureMeta ?? null,
    cost: clinical.cost ?? null,
    isBillable: clinical.isBillable ?? null,
  }
}
