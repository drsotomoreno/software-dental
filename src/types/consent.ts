import type { SignatureCaptureMetadata } from './signature'
import type { SectionBiometricSignature } from './sectionSignature'

/** Consentimiento informado — procedimientos odontológicos Colombia */
import type { ConsentTemplateId } from '@/constants/consentTemplates'

export interface InformedConsent {
  selectedConsentIds: ConsentTemplateId[]
  textAccepted: boolean
  patientSignatureDataUrl?: string
  patientSignatureMeta?: SignatureCaptureMetadata
  professionalSignatureDataUrl?: string
  professionalSignatureMeta?: SignatureCaptureMetadata
  professionalLicense: string
  /** Conservado por compatibilidad de historias firmadas; se iguala a la cédula. */
  professionalRegistry: string
  signedAt?: string
  /** Sello de MasterSignatureModal. Presente solo si el consentimiento quedó bloqueado. */
  legalSignature?: SectionBiometricSignature
}

export function createEmptyConsent(
  professionalLicense = '',
  professionalRegistry = '',
): InformedConsent {
  return {
    selectedConsentIds: [],
    textAccepted: false,
    professionalLicense,
    professionalRegistry,
  }
}

export function normalizeConsent(
  data: Partial<InformedConsent> | undefined,
  professionalLicense = '',
  professionalRegistry = '',
): InformedConsent {
  const base = createEmptyConsent(professionalLicense, professionalRegistry)
  if (!data) return base

  const selectedConsentIds =
    data.selectedConsentIds && data.selectedConsentIds.length > 0
      ? data.selectedConsentIds
      : data.textAccepted
        ? (['general_odonto'] as ConsentTemplateId[])
        : []

  return {
    ...base,
    ...data,
    selectedConsentIds,
  }
}
