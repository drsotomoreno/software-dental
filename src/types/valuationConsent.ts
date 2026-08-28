/** Consentimiento informado — Valoración y Diagnóstico Integral (Ley 1581/2012) */

export const VALUATION_CONSENT_VERSION = '2026.1-colombia'

export interface ValuationConsentMetadata {
  /** consentimiento_valoracion_aceptado */
  consentimientoValoracionAceptado: boolean
  /** consentimiento_timestamp — ISO 8601 */
  consentimientoTimestamp: string
  /** dispositivo_id — identificador local del equipo de registro */
  dispositivoId: string
  consentVersion: string
  acceptedByUserId?: string
  /** Copia estática del texto aceptado (trazabilidad) */
  textSnapshot: string
}

export interface ValuationConsentDraft {
  accepted: boolean
  metadata: ValuationConsentMetadata | null
}

export function createEmptyValuationConsentDraft(): ValuationConsentDraft {
  return { accepted: false, metadata: null }
}
