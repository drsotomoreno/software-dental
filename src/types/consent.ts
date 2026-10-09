import type { SignatureCaptureMetadata } from './signature'
import type { ConsentTemplateId } from '@/constants/consentTemplates'
import type { ClinicalConsentCategoryId } from '@/constants/consentCategories'
import { applyInformedConsentNormalization } from '@/utils/informedConsentRules'

/**
 * Un consentimiento archivado cubre todas las atenciones de una categoría clínica.
 * No se vincula a una cita ni sustituye el plan completo con un texto general.
 */
export interface CategoryInformedConsent {
  id: string
  categoryId: ClinicalConsentCategoryId
  templateId: ConsentTemplateId
  status: 'borrador' | 'archivado'
  scope: 'categoria_clinica'
  textAccepted: boolean
  patientSignatureDataUrl?: string
  patientSignatureMeta?: SignatureCaptureMetadata
  professionalSignatureDataUrl?: string
  professionalSignatureMeta?: SignatureCaptureMetadata
  professionalLicense: string
  /** Conservado por compatibilidad de historias firmadas; se iguala a la cédula. */
  professionalRegistry: string
  signedAt?: string
  archivedAt?: string
}

/**
 * Proyección de compatibilidad (`selectedConsentIds` y firmas de primer nivel)
 * más el archivo real por categoría en `records`.
 */
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
  records: CategoryInformedConsent[]
}

export function createEmptyConsent(
  professionalLicense = '',
  professionalRegistry = '',
): InformedConsent {
  return {
    selectedConsentIds: [],
    textAccepted: false,
    professionalLicense,
    professionalRegistry: professionalRegistry || professionalLicense,
    records: [],
  }
}

export function normalizeConsent(
  data: Partial<InformedConsent> | undefined,
  professionalLicense = '',
  professionalRegistry = '',
): InformedConsent {
  return applyInformedConsentNormalization(data, professionalLicense, professionalRegistry)
}
