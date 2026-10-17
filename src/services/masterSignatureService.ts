import { db } from '@/db/database'
import type { ClinicalRecord, ClinicalRecordFormData } from '@/types/clinicalRecord'
import type { OdontogramData } from '@/types/odontogram'
import type { SignatureCaptureResult } from '@/types/signature'
import { normalizeAnamnesis } from '@/types/anamnesis'
import { normalizeConsent } from '@/types/consent'
import { savePatientClinicalDraft } from '@/utils/patientClinicalDraft'
import { getLatestClinicalRecord } from '@/utils/clinicalRecordSnapshot'
import { computeContentHash, serializeForHash } from '@/utils/crypto'
import { buildRecordHashPayload } from '@/utils/recordIntegrity'
import { toPatientForeignKey } from '@/utils/patientId'
import {
  applyMasterSignature,
  isAnamnesisLegallyLocked,
  isConsentLegallyLocked,
  isTreatmentLegallyLocked,
  validateMasterSignature,
  type MasterSignatureAcceptance,
} from '@/utils/masterSignature'

export interface PersistMasterSignatureInput {
  patientRouteId: string
  clinicalData: ClinicalRecordFormData
  odontogram: OdontogramData | null
  acceptance: MasterSignatureAcceptance
  patientSignature: SignatureCaptureResult | null
  professionalSignature: SignatureCaptureResult | null
}

export interface PersistMasterSignatureSuccess {
  ok: true
  clinicalData: ClinicalRecordFormData
  odontogram: OdontogramData | null
}

async function persistOdontogram(
  patientRouteId: string,
  odontogram: OdontogramData,
): Promise<OdontogramData> {
  const patientId = toPatientForeignKey(patientRouteId)
  const payload = {
    ...odontogram,
    patientId,
    updatedAt: new Date().toISOString(),
  }

  if (odontogram.id) {
    await db.odontograms.update(odontogram.id, payload)
    return payload
  }

  const newId = await db.odontograms.add(payload)
  return { ...payload, id: String(newId) }
}

async function patchLatestClinicalRecord(
  patientRouteId: string,
  next: ClinicalRecordFormData,
  acceptance: MasterSignatureAcceptance,
  previous: ClinicalRecordFormData,
): Promise<void> {
  const latest = await getLatestClinicalRecord(patientRouteId)
  if (latest?.id == null) return

  const writesAnamnesis =
    acceptance.hasAcceptedAnamnesis && !isAnamnesisLegallyLocked(previous.anamnesis)
  const writesTreatment = acceptance.hasAcceptedTreatment && !isTreatmentLegallyLocked(previous)
  const writesConsent =
    acceptance.hasAcceptedConsent && !isConsentLegallyLocked(previous.informedConsent)

  const patched: ClinicalRecord = { ...latest }

  if (writesAnamnesis && next.anamnesis.legalSignature) {
    patched.anamnesis = {
      ...normalizeAnamnesis(latest.anamnesis),
      legalSignature: next.anamnesis.legalSignature,
    }
  }

  if (writesTreatment && next.treatmentPlanLegal) {
    patched.treatmentPlanLegal = next.treatmentPlanLegal
  }

  if (writesConsent && next.informedConsent.legalSignature) {
    const seal = next.informedConsent.legalSignature
    patched.informedConsent = {
      ...normalizeConsent(latest.informedConsent),
      textAccepted: true,
      patientSignatureDataUrl: seal.patientSignatureDataUrl,
      patientSignatureMeta: seal.patientSignatureMeta,
      professionalSignatureDataUrl: seal.professionalSignatureDataUrl,
      professionalSignatureMeta: seal.professionalSignatureMeta,
      signedAt: seal.signedAt,
      legalSignature: seal,
    }
  }

  const signedAt =
    next.anamnesis.legalSignature?.signedAt ??
    next.treatmentPlanLegal?.signedAt ??
    next.informedConsent.legalSignature?.signedAt ??
    new Date().toISOString()

  patched.updatedAt = signedAt
  const contentHash = await computeContentHash(serializeForHash(buildRecordHashPayload(patched)))

  await db.clinicalRecords.update(latest.id, {
    ...(writesAnamnesis ? { anamnesis: patched.anamnesis } : {}),
    ...(writesTreatment ? { treatmentPlanLegal: patched.treatmentPlanLegal } : {}),
    ...(writesConsent ? { informedConsent: patched.informedConsent } : {}),
    contentHash,
    updatedAt: signedAt,
  })
}

export async function persistMasterSignature(
  input: PersistMasterSignatureInput,
): Promise<PersistMasterSignatureSuccess | { ok: false; error: string }> {
  const validationError = validateMasterSignature(input)
  if (validationError) return { ok: false, error: validationError }
  if (!input.patientSignature || !input.professionalSignature) {
    return { ok: false, error: 'Faltan las firmas del paciente y del odontólogo.' }
  }

  const signedAt = new Date().toISOString()
  const next = applyMasterSignature({
    clinicalData: input.clinicalData,
    acceptance: input.acceptance,
    patientSignature: input.patientSignature,
    professionalSignature: input.professionalSignature,
    signedAt,
  })

  const writesTreatment =
    input.acceptance.hasAcceptedTreatment && !isTreatmentLegallyLocked(input.clinicalData)

  let odontogram = input.odontogram
  if (writesTreatment && odontogram) {
    odontogram = await persistOdontogram(input.patientRouteId, odontogram)
  }

  await savePatientClinicalDraft(input.patientRouteId, next, odontogram)
  try {
    await patchLatestClinicalRecord(input.patientRouteId, next, input.acceptance, input.clinicalData)
  } catch {
    // El borrador vivo ya guarda el sello. Un snapshot anterior no debe impedir el bloqueo.
  }

  return { ok: true, clinicalData: next, odontogram }
}
