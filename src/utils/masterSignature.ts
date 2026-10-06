import type { Anamnesis } from '@/types/anamnesis'
import type { InformedConsent } from '@/types/consent'
import type { ClinicalRecordFormData } from '@/types/clinicalRecord'
import type { SignatureCaptureResult } from '@/types/signature'
import type { SectionBiometricSignature } from '@/types/sectionSignature'
import { isSectionBiometricSignature } from '@/types/sectionSignature'
import { validateSignatureCapture } from '@/services/signatureService'

export interface MasterSignatureAcceptance {
  hasAcceptedAnamnesis: boolean
  hasAcceptedTreatment: boolean
  hasAcceptedConsent: boolean
}

export function isAnamnesisLegallyLocked(anamnesis: Anamnesis | null | undefined): boolean {
  return isSectionBiometricSignature(anamnesis?.legalSignature)
}

export function isTreatmentLegallyLocked(
  data: Pick<ClinicalRecordFormData, 'treatmentPlanLegal'> | null | undefined,
): boolean {
  return isSectionBiometricSignature(data?.treatmentPlanLegal)
}

export function isConsentLegallyLocked(consent: InformedConsent | null | undefined): boolean {
  return isSectionBiometricSignature(consent?.legalSignature)
}

/** La primera cita es la que todavía no tiene la anamnesis sellada. */
export function isFirstAppointment(data: ClinicalRecordFormData | null | undefined): boolean {
  return !isAnamnesisLegallyLocked(data?.anamnesis)
}

function buildSeal(
  patient: SignatureCaptureResult,
  professional: SignatureCaptureResult,
  signedAt: string,
): SectionBiometricSignature {
  return {
    patientSignatureDataUrl: patient.dataUrl,
    patientSignatureMeta: { ...patient.metadata },
    professionalSignatureDataUrl: professional.dataUrl,
    professionalSignatureMeta: { ...professional.metadata },
    signedAt,
  }
}

export function validateMasterSignature(input: {
  clinicalData: ClinicalRecordFormData
  acceptance: MasterSignatureAcceptance
  patientSignature: SignatureCaptureResult | null
  professionalSignature: SignatureCaptureResult | null
}): string | null {
  const { clinicalData, acceptance } = input
  const anamnesisLocked = isAnamnesisLegallyLocked(clinicalData.anamnesis)
  const treatmentLocked = isTreatmentLegallyLocked(clinicalData)
  const consentLocked = isConsentLegallyLocked(clinicalData.informedConsent)

  if (isFirstAppointment(clinicalData) && !acceptance.hasAcceptedAnamnesis) {
    return 'Para cerrar la primera cita debe certificar que los datos de la anamnesis son reales.'
  }

  const writesSomething =
    (acceptance.hasAcceptedAnamnesis && !anamnesisLocked) ||
    (acceptance.hasAcceptedTreatment && !treatmentLocked) ||
    (acceptance.hasAcceptedConsent && !consentLocked)

  if (!writesSomething) {
    return 'Seleccione al menos una sección para bloquear.'
  }

  const patientError = validateSignatureCapture(input.patientSignature)
  if (patientError) return `Firma del paciente: ${patientError}`

  const professionalError = validateSignatureCapture(input.professionalSignature)
  if (professionalError) return `Firma del odontólogo: ${professionalError}`

  return null
}

export function applyMasterSignature(input: {
  clinicalData: ClinicalRecordFormData
  acceptance: MasterSignatureAcceptance
  patientSignature: SignatureCaptureResult
  professionalSignature: SignatureCaptureResult
  signedAt: string
}): ClinicalRecordFormData {
  const { clinicalData, acceptance, patientSignature, professionalSignature, signedAt } = input
  const next: ClinicalRecordFormData = { ...clinicalData }

  if (acceptance.hasAcceptedAnamnesis && !isAnamnesisLegallyLocked(clinicalData.anamnesis)) {
    next.anamnesis = {
      ...clinicalData.anamnesis,
      legalSignature: buildSeal(patientSignature, professionalSignature, signedAt),
    }
  }

  if (acceptance.hasAcceptedTreatment && !isTreatmentLegallyLocked(clinicalData)) {
    next.treatmentPlanLegal = buildSeal(patientSignature, professionalSignature, signedAt)
  }

  if (acceptance.hasAcceptedConsent && !isConsentLegallyLocked(clinicalData.informedConsent)) {
    const seal = buildSeal(patientSignature, professionalSignature, signedAt)
    next.informedConsent = {
      ...clinicalData.informedConsent,
      textAccepted: true,
      patientSignatureDataUrl: seal.patientSignatureDataUrl,
      patientSignatureMeta: seal.patientSignatureMeta,
      professionalSignatureDataUrl: seal.professionalSignatureDataUrl,
      professionalSignatureMeta: seal.professionalSignatureMeta,
      signedAt: seal.signedAt,
      legalSignature: seal,
    }
  }

  return next
}

/** Impide que un guardado posterior borre un sello ya escrito en Dexie. */
export function preserveLegalSeals(
  previous: ClinicalRecordFormData | null,
  next: ClinicalRecordFormData,
): ClinicalRecordFormData {
  if (!previous) return next

  const anamnesisLocked = isAnamnesisLegallyLocked(previous.anamnesis)
  const treatmentLocked = isTreatmentLegallyLocked(previous)
  const consentLocked = isConsentLegallyLocked(previous.informedConsent)

  if (!anamnesisLocked && !treatmentLocked && !consentLocked) return next

  return {
    ...next,
    anamnesis: anamnesisLocked ? previous.anamnesis : next.anamnesis,
    treatmentPlan: treatmentLocked ? previous.treatmentPlan : next.treatmentPlan,
    treatmentPlanNotes: treatmentLocked ? previous.treatmentPlanNotes : next.treatmentPlanNotes,
    treatmentPlanLegal: treatmentLocked ? previous.treatmentPlanLegal : next.treatmentPlanLegal,
    budgetItems: treatmentLocked ? previous.budgetItems : next.budgetItems,
    budget: treatmentLocked ? previous.budget : next.budget,
    orthodonticsBudget: treatmentLocked ? previous.orthodonticsBudget : next.orthodonticsBudget,
    dentalImplantsBudget: treatmentLocked
      ? previous.dentalImplantsBudget
      : next.dentalImplantsBudget,
    informedConsent: consentLocked ? previous.informedConsent : next.informedConsent,
  }
}
