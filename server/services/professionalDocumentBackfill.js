import { clinicSyncAliasIds } from '../../shared/clinicalSyncScope.js'
import {
  dominantProfessionalDocument,
  professionalDocumentCandidatesForSigner,
} from '../../shared/professionalDocument.js'
import { pullClinicSnapshot } from './clinicalSyncStore.js'

function payloadOf(record) {
  if (!record || typeof record !== 'object') return null
  if (record.payload && typeof record.payload === 'object' && !Array.isArray(record.payload)) {
    return record.payload
  }
  return record
}

/** Una sola cédula repetida en las atenciones de quien firma. Si hay varias, no se adivina. */
export function professionalDocumentFromSnapshot(snapshot, signer, documentType = 'CC') {
  const candidates = []
  const drafts = Array.isArray(snapshot?.drafts) ? snapshot.drafts : []
  for (const record of drafts) {
    const payload = payloadOf(record)
    if (!payload) continue
    candidates.push(
      ...professionalDocumentCandidatesForSigner(payload.clinicalDraft, signer),
      ...professionalDocumentCandidatesForSigner(payload.valuationDraft, signer),
      ...professionalDocumentCandidatesForSigner({ evolutionNotes: payload.evolutionNotes }, signer),
    )
  }
  const records = Array.isArray(snapshot?.clinicalRecords) ? snapshot.clinicalRecords : []
  for (const record of records) {
    const payload = payloadOf(record)
    if (!payload) continue
    candidates.push(...professionalDocumentCandidatesForSigner(payload, signer))
  }
  return dominantProfessionalDocument(candidates, documentType)
}

export async function dominantDocumentFromClinic(user) {
  const scope = clinicSyncAliasIds(user)
  if (!scope.canonical) return ''
  const snapshot = await pullClinicSnapshot(scope.canonical, scope.aliases, { includeBlobs: false })
  return professionalDocumentFromSnapshot(snapshot, { id: user?.id, email: user?.email }, user?.documentType || 'CC')
}
