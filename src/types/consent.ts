import type { SignatureCaptureMetadata } from './signature'

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
  professionalRegistry: string
  signedAt?: string
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
