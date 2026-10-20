import { db } from '@/db/database'
import { createDigitalSignature, validateSignatureCapture } from '@/services/signatureService'
import { normalizeClinicalRecordPayments } from '@/services/paymentInvoiceService'
import type { AuthUser } from '@/types/auth'
import type { ClinicalRecord, ClinicalRecordFormData, TreatingDentistSignature } from '@/types/clinicalRecord'
import type { EvolutionNote } from '@/types/evolutionNote'
import { isEvolutionNoteImmutable } from '@/types/evolutionNote'
import type { OdontogramData } from '@/types/odontogram'
import type { SignatureCaptureResult } from '@/types/signature'
import { computeContentHash, serializeForHash } from '@/utils/crypto'
import {
  getMainHistorySignatureStatus,
  listPatientClinicalRecords,
} from '@/utils/clinicalRecordSnapshot'
import { savePatientClinicalDraft } from '@/utils/patientClinicalDraft'
import { toPatientForeignKey } from '@/utils/patientId'
import { sortEvolutionNotesChronologically } from '@/utils/recordIntegrity'

export interface RegisterTreatingDentistSignatureInput {
  patientId: string
  professionalId: string
  professionalName: string
  professionalDocument: string
  rethusNumber?: string
  clinicalData: ClinicalRecordFormData
  odontogram: OdontogramData | null
  capture: SignatureCaptureResult
  user: AuthUser
}

function snapshotEvolutionNotes(
  existing: EvolutionNote[] | undefined,
  incoming: EvolutionNote[],
): EvolutionNote[] {
  const signed = new Map(
    (existing ?? []).filter(isEvolutionNoteImmutable).map((note) => [note.id, note]),
  )
  const merged = incoming.map((note) => signed.get(note.id) ?? note)
  for (const note of signed.values()) {
    if (!merged.some((item) => item.id === note.id)) merged.push(note)
  }
  return sortEvolutionNotesChronologically(merged)
}

function latestUnsignedRecord(records: ClinicalRecord[]): ClinicalRecord | null {
  const candidates = records.filter(
    (record) => !record.isLocked && !record.isSigned && !record.treatingDentistSignature?.signedAt,
  )
  if (candidates.length === 0) return null
  return [...candidates].sort((a, b) =>
    (b.updatedAt ?? b.createdAt ?? '').localeCompare(a.updatedAt ?? a.createdAt ?? ''),
  )[0]
}

/**
 * Registra una sola vez la firma del odontólogo tratante sobre la historia principal.
 * No cierra el snapshot RIPS, no exige consentimiento y no reescribe evoluciones firmadas.
 */
export async function registerTreatingDentistSignature(
  input: RegisterTreatingDentistSignatureInput,
): Promise<{ ok: true; recordId: string; signedAt: string } | { ok: false; error: string }> {
  const captureError = validateSignatureCapture(input.capture)
  if (captureError) return { ok: false, error: captureError }

  const patientId = toPatientForeignKey(input.patientId)
  const current = await getMainHistorySignatureStatus(patientId)
  if (current.signed) {
    return { ok: false, error: 'La historia clínica principal ya fue firmada.' }
  }

  const now = new Date().toISOString()
  const normalized = normalizeClinicalRecordPayments(input.clinicalData, input.professionalId)
  const records = await listPatientClinicalRecords(patientId)
  const existing = latestUnsignedRecord(records)
  const evolutionNotes = snapshotEvolutionNotes(
    existing?.evolutionNotes,
    normalized.evolutionNotes ?? [],
  )

  const recordBody = {
    patientId,
    professionalId: input.professionalId,
    anamnesis: normalized.anamnesis,
    stomatologicalExam: normalized.stomatologicalExam,
    specializedAnnexes: normalized.specializedAnnexes,
    diagnosticChart: normalized.diagnosticChart,
    odontogramSnapshot: input.odontogram
      ? { ...input.odontogram, patientId, updatedAt: now }
      : existing?.odontogramSnapshot,
    diagnoses: normalized.diagnoses,
    diagnosisNotes: normalized.diagnosisNotes ?? '',
    findings: normalized.findings,
    treatmentPlan: normalized.treatmentPlan,
    treatmentPlanNotes: normalized.treatmentPlanNotes ?? '',
    budgetItems: normalized.budgetItems,
    orthodonticsBudget: normalized.orthodonticsBudget,
    dentalImplantsBudget: normalized.dentalImplantsBudget,
    budget: normalized.budget,
    paymentPlan: normalized.paymentPlan,
    paymentControl: normalized.paymentControl,
    paymentControlLines: normalized.paymentControlLines ?? [],
    orthodonticsPaymentControl: normalized.orthodonticsPaymentControl ?? [],
    evolutionNotes,
    informedConsent: normalized.informedConsent,
    valuationConsent: normalized.valuationConsent ?? existing?.valuationConsent ?? null,
  }

  const contentHash = await computeContentHash(serializeForHash(recordBody))
  const treatingDentistSignature: TreatingDentistSignature = {
    professionalId: input.professionalId,
    professionalName: input.professionalName,
    professionalDocument: input.professionalDocument,
    rethusNumber: input.rethusNumber?.trim() || undefined,
    signatureDataUrl: input.capture.dataUrl,
    signatureMeta: input.capture.metadata,
    signedAt: now,
    contentHash,
  }

  const stored = {
    ...recordBody,
    isSigned: true as const,
    isLocked: false,
    signedAt: now,
    contentHash,
    treatingDentistSignature,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  }

  let recordKey: number | string
  if (existing?.id != null) {
    await db.clinicalRecords.update(existing.id, stored)
    recordKey = existing.id
  } else {
    const added = await db.clinicalRecords.add(stored)
    if (added == null) {
      return { ok: false, error: 'No se pudo registrar la historia clínica.' }
    }
    recordKey = added
  }

  const signatureId = await createDigitalSignature({
    recordId: String(recordKey),
    recordType: 'main_clinical_history',
    capture: input.capture,
    contentHash,
    user: input.user,
    signedByName: input.professionalName,
    signedByDocument: input.professionalDocument,
  })

  await db.clinicalRecords.update(recordKey, {
    signatureId,
    treatingDentistSignature: { ...treatingDentistSignature, signatureId },
    updatedAt: new Date().toISOString(),
  })

  await savePatientClinicalDraft(patientId, normalized, input.odontogram)

  return { ok: true, recordId: String(recordKey), signedAt: now }
}
