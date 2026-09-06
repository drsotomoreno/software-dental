import type { DiagnosisCertainty } from './clinicalRecord'
import type { DocumentType } from './patient'

/** Estado del consentimiento criptográfico temporal (OTP delegado IHCE). */
export type IhceConsentStatus =
  | 'pending'
  | 'authorized'
  | 'denied'
  | 'expired'
  | 'consumed'

export type IhceRdaSource = 'minsalud-simulado'

export interface IhceCie10Diagnosis {
  code: string
  description: string
  type: 'principal' | 'relacionado'
  certainty?: DiagnosisCertainty
}

export interface IhceCupsProcedure {
  cupsCode: string
  description: string
  performedAt?: string
  performerName?: string
}

/**
 * Consentimiento criptográfico temporal — Ley 1581 / Res. 1888 de 2025.
 * El PIN OTP nunca se persiste en claro; solo su hash SHA-256 mientras está pending.
 */
export interface IhceDelegatedConsent {
  id: string
  patientId: string
  documentType: DocumentType
  documentNumber: string
  requestedAt: string
  expiresAt: string
  authorizedAt?: string
  consumedAt?: string
  ipAddress: string
  userAgent: string
  requestedByUserId: string | null
  /** Últimos dígitos enmascarados, p. ej. `***01` o `**` si no hay teléfono. */
  maskedPhone: string
  /** SHA-256(pin + consentId + documentNumber). Solo en `pending`. */
  otpHash?: string
  /** Sello SHA-256 del payload canónico (cédula, timestamps, IP, nonce, estado). */
  consentHash: string
  nonce: string
  status: IhceConsentStatus
  attemptCount: number
}

/** RDA estructurado cacheado en IndexedDB para lectura offline. */
export interface IhceRdaRecord {
  id: string
  patientId: string
  documentNumber: string
  consentId: string
  downloadedAt: string
  source: IhceRdaSource
  payloadHash: string
  diagnoses: IhceCie10Diagnosis[]
  procedures: IhceCupsProcedure[]
  compositionId?: string
  rawBundle?: unknown
}

export const IHCE_SIMULATED_OTP = '123456'
export const IHCE_OTP_TTL_MS = 10 * 60 * 1000
export const IHCE_OTP_MAX_ATTEMPTS = 3
export const IHCE_OTP_LENGTH = 6

export const IHCE_REQUEST_EVENT = 'ihce:request-external-history'
export const IHCE_NAVIGATE_EVENT = 'ihce:navigate-patient'

export function maskPhoneLastTwo(phone: string | undefined | null): string {
  const digits = String(phone ?? '').replace(/\D/g, '')
  if (digits.length < 2) return '**'
  return `***${digits.slice(-2)}`
}

export function buildOtpSentAlert(maskedPhone: string): string {
  return `Código de autorización enviado al celular registrado terminado en ${maskedPhone}`
}
