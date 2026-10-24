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
  /** Conservado por compatibilidad de historias firmadas; se iguala a la cédula. */
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

function consentText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function asConsentRecord(value: unknown): Partial<InformedConsent> | null {
  if (!value || typeof value !== 'object') return null
  return value as Partial<InformedConsent>
}

/**
 * Una copia más nueva del consentimiento no puede dejar la firma en blanco.
 * La firma nueva sí reemplaza a la anterior; la ausencia no la borra.
 */
export function keepStoredConsentSignatures<T>(previous: unknown, next: T): T {
  if (!next || typeof next !== 'object') return next
  const stored = asConsentRecord(previous)
  if (!stored) return next

  const incoming = next as Partial<InformedConsent>
  const keepPatient =
    !consentText(incoming.patientSignatureDataUrl) && consentText(stored.patientSignatureDataUrl)
  const keepProfessional =
    !consentText(incoming.professionalSignatureDataUrl) &&
    consentText(stored.professionalSignatureDataUrl)
  const stillHasSignature =
    keepPatient ||
    keepProfessional ||
    Boolean(consentText(incoming.patientSignatureDataUrl)) ||
    Boolean(consentText(incoming.professionalSignatureDataUrl))
  const keepSignedAt =
    stillHasSignature && !consentText(incoming.signedAt) && consentText(stored.signedAt)

  if (!keepPatient && !keepProfessional && !keepSignedAt) return next

  return {
    ...incoming,
    ...(keepPatient
      ? {
          patientSignatureDataUrl: stored.patientSignatureDataUrl,
          patientSignatureMeta: stored.patientSignatureMeta,
        }
      : {}),
    ...(keepProfessional
      ? {
          professionalSignatureDataUrl: stored.professionalSignatureDataUrl,
          professionalSignatureMeta: stored.professionalSignatureMeta,
        }
      : {}),
    ...(keepSignedAt ? { signedAt: stored.signedAt } : {}),
  } as T
}

export interface StoredConsentSignatures {
  selectedConsentIds?: readonly string[]
  patientSignatureDataUrl?: string
  patientSignatureMeta?: SignatureCaptureMetadata
  professionalSignatureDataUrl?: string
  professionalSignatureMeta?: SignatureCaptureMetadata
  signedAt?: string
}

/** Devuelve las firmas al consentimiento abierto si el guardado aún las tiene. */
export function restoreMissingConsentSignatures(
  current: InformedConsent,
  stored: StoredConsentSignatures | null | undefined,
): InformedConsent {
  if (!stored) return current
  const currentIds = current.selectedConsentIds ?? []
  if (currentIds.length === 0) return current
  const storedIds = stored.selectedConsentIds ?? []
  const overlaps =
    storedIds.length === 0 || storedIds.some((id) => currentIds.includes(id as ConsentTemplateId))
  if (!overlaps) return current
  return keepStoredConsentSignatures(stored, current)
}
