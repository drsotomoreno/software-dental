import type { SignatureCaptureMetadata } from '@/types/signature'

/**
 * Autorización conjunta del Plan de Tratamiento / Presupuesto
 * (odontólogo + paciente o representante legal si es menor).
 */
export interface TreatmentPlanAuthorization {
  textAccepted: boolean
  patientSignatureDataUrl?: string
  patientSignatureMeta?: SignatureCaptureMetadata
  professionalSignatureDataUrl?: string
  professionalSignatureMeta?: SignatureCaptureMetadata
  professionalLicense: string
  /** Nombre del acudiente / representante legal (obligatorio si menor de 18). */
  guardianName?: string
  /** Documento del acudiente / representante legal (obligatorio si menor de 18). */
  guardianDocument?: string
  signedAt?: string
}

export function createEmptyTreatmentPlanAuthorization(
  professionalLicense = '',
): TreatmentPlanAuthorization {
  return {
    textAccepted: false,
    professionalLicense,
  }
}

export function normalizeTreatmentPlanAuthorization(
  data: Partial<TreatmentPlanAuthorization> | null | undefined,
  professionalLicense = '',
): TreatmentPlanAuthorization {
  const base = createEmptyTreatmentPlanAuthorization(professionalLicense)
  if (!data) return base
  return {
    ...base,
    ...data,
    textAccepted: data.textAccepted === true,
    professionalLicense: data.professionalLicense?.trim() || professionalLicense,
  }
}
