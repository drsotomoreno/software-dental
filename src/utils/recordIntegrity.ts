import type { ClinicalRecord } from '@/types/clinicalRecord'
import type { EvolutionNote } from '@/types/evolutionNote'
import { normalizeSpecializedAnnexes } from '@/types/specializedAnnexes'
import { computeContentHash, serializeForHash } from './crypto'

export function sortEvolutionNotesChronologically(notes: EvolutionNote[]): EvolutionNote[] {
  return [...notes].sort((a, b) => {
    const dateA = new Date(a.date || a.createdAt).getTime()
    const dateB = new Date(b.date || b.createdAt).getTime()
    if (dateA !== dateB) return dateA - dateB
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  })
}

export function buildRecordHashPayload(record: ClinicalRecord) {
  return {
    patientId: record.patientId,
    professionalId: record.professionalId,
    anamnesis: record.anamnesis,
    stomatologicalExam: record.stomatologicalExam,
    specializedAnnexes: normalizeSpecializedAnnexes(record.specializedAnnexes),
    odontogramSnapshot: record.odontogramSnapshot,
    diagnoses: record.diagnoses,
    diagnosisNotes: record.diagnosisNotes ?? '',
    findings: record.findings,
    treatmentPlan: record.treatmentPlan,
    treatmentPlanNotes: record.treatmentPlanNotes ?? '',
    budgetItems: record.budgetItems,
    orthodonticsBudget: record.orthodonticsBudget,
    dentalImplantsBudget: record.dentalImplantsBudget,
    budget: record.budget,
    paymentPlan: record.paymentPlan,
    paymentControl: record.paymentControl,
    orthodonticsPaymentControl: record.orthodonticsPaymentControl ?? [],
    evolutionNotes: sortEvolutionNotesChronologically(record.evolutionNotes ?? []),
    informedConsent: record.informedConsent,
  }
}

export async function verifyClinicalRecordIntegrity(
  record: ClinicalRecord,
): Promise<{ valid: boolean; storedHash?: string; computedHash: string }> {
  const computedHash = await computeContentHash(
    serializeForHash(buildRecordHashPayload(record)),
  )
  const storedHash = record.contentHash
  return {
    valid: Boolean(storedHash && storedHash === computedHash),
    storedHash,
    computedHash,
  }
}

export async function verifyPatientRecordsIntegrity(
  records: ClinicalRecord[],
): Promise<
  Array<{
    recordId: string
    signedAt?: string
    valid: boolean
    storedHash?: string
    computedHash: string
  }>
> {
  const locked = records.filter((r) => r.isLocked)
  const results = await Promise.all(
    locked.map(async (record) => {
      const verification = await verifyClinicalRecordIntegrity(record)
      return {
        recordId: String(record.id ?? ''),
        signedAt: record.signedAt,
        ...verification,
      }
    }),
  )
  return results.sort(
    (a, b) => new Date(a.signedAt ?? 0).getTime() - new Date(b.signedAt ?? 0).getTime(),
  )
}
