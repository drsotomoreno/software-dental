import type { SignatureCaptureMetadata } from './signature'

/**
 * Sello biométrico de una sección clínica (Res. 1995/1999, Ley 527).
 * Paciente y odontólogo firman el mismo acto; el timestamp cierra la sección.
 */
export interface SectionBiometricSignature {
  patientSignatureDataUrl: string
  patientSignatureMeta: SignatureCaptureMetadata
  professionalSignatureDataUrl: string
  professionalSignatureMeta: SignatureCaptureMetadata
  signedAt: string
}

export function isSectionBiometricSignature(
  seal: SectionBiometricSignature | null | undefined,
): seal is SectionBiometricSignature {
  return Boolean(
    seal?.signedAt &&
      seal.patientSignatureDataUrl &&
      seal.professionalSignatureDataUrl &&
      seal.patientSignatureMeta?.signatureMethod === 'canvas_biometric' &&
      seal.professionalSignatureMeta?.signatureMethod === 'canvas_biometric',
  )
}
