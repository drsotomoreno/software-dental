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
  /** Nombre del acudiente / representante legal (obligatorio si el paciente es menor de 18). */
  guardianName?: string
  /** Documento del acudiente / representante legal (obligatorio si el paciente es menor de 18). */
  guardianDocument?: string
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
      : data.textAccepted ||
          Boolean(consentText(data.signedAt)) ||
          Boolean(consentText(data.patientSignatureDataUrl))
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
 * Un consentimiento cuenta como firmado si identifica el procedimiento y hay
 * evidencia de firma del paciente (fecha o imagen). No exige textAccepted:
 * un borrador puede haber desmarcado el checkbox sin borrar la firma guardada.
 */
export function isSignedInformedConsent(
  consent: Partial<InformedConsent> | null | undefined,
): boolean {
  if (!consent) return false
  const ids =
    consent.selectedConsentIds && consent.selectedConsentIds.length > 0
      ? consent.selectedConsentIds
      : normalizeConsent(consent).selectedConsentIds
  if (!ids.length) return false
  if (consentText(consent.signedAt)) return true
  return Boolean(consentText(consent.patientSignatureDataUrl))
}

/** IDs de procedimientos con consentimiento firmado (sin duplicados, orden de aparición). */
export function signedConsentTemplateIds(
  consents: Array<Partial<InformedConsent> | null | undefined>,
): ConsentTemplateId[] {
  const ids: ConsentTemplateId[] = []
  const seen = new Set<string>()

  for (const consent of consents) {
    if (!isSignedInformedConsent(consent)) continue
    const selected =
      consent?.selectedConsentIds && consent.selectedConsentIds.length > 0
        ? consent.selectedConsentIds
        : normalizeConsent(consent ?? undefined).selectedConsentIds
    for (const id of selected) {
      if (seen.has(id)) continue
      seen.add(id)
      ids.push(id)
    }
  }

  return ids
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
  const keepTextAccepted =
    stillHasSignature && incoming.textAccepted !== true && stored.textAccepted === true
  const incomingIds = Array.isArray(incoming.selectedConsentIds)
    ? incoming.selectedConsentIds
    : []
  const storedIds = Array.isArray(stored.selectedConsentIds) ? stored.selectedConsentIds : []
  const keepSelectedIds =
    stillHasSignature && incomingIds.length === 0 && storedIds.length > 0

  if (
    !keepPatient &&
    !keepProfessional &&
    !keepSignedAt &&
    !keepTextAccepted &&
    !keepSelectedIds
  ) {
    return next
  }

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
    ...(keepTextAccepted ? { textAccepted: true } : {}),
    ...(keepSelectedIds ? { selectedConsentIds: storedIds } : {}),
  } as T
}

export interface StoredConsentSignatures {
  selectedConsentIds?: readonly string[]
  patientSignatureDataUrl?: string
  patientSignatureMeta?: SignatureCaptureMetadata
  professionalSignatureDataUrl?: string
  professionalSignatureMeta?: SignatureCaptureMetadata
  signedAt?: string
  textAccepted?: boolean
}

/** Devuelve las firmas al consentimiento abierto si el guardado aún las tiene. */
export function restoreMissingConsentSignatures(
  current: InformedConsent,
  stored: StoredConsentSignatures | null | undefined,
): InformedConsent {
  if (!stored) return current
  const currentIds = current.selectedConsentIds ?? []
  const storedIds = stored.selectedConsentIds ?? []
  // Si el formulario quedó sin procedimiento pero el guardado sí lo tiene firmado,
  // recupera IDs + firmas para no mostrar la falsa alerta de "sin consentimientos".
  if (currentIds.length === 0) {
    if (storedIds.length === 0 && !consentText(stored.patientSignatureDataUrl) && !consentText(stored.signedAt)) {
      return current
    }
    return keepStoredConsentSignatures(stored, current)
  }
  const overlaps =
    storedIds.length === 0 || storedIds.some((id) => currentIds.includes(id as ConsentTemplateId))
  if (!overlaps) return current
  return keepStoredConsentSignatures(stored, current)
}
