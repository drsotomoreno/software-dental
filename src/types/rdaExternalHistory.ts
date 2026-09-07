/** Consentimiento criptográfico y RDA externo (consulta simulada Minsalud / IHCE). */

export const RDA_CONSENT_PURPOSE = 'consulta_rda_minsalud' as const
export const RDA_HASH_ALGORITHM = 'SHA-256' as const
export const RDA_EXTERNAL_SOURCE = 'minsalud_rda_simulado' as const

export const RDA_LEGAL_BASIS = [
  'Ley 1581 de 2012 — Protección de datos personales (habeas data)',
  'Ley 23 de 1981 — Historia clínica y derecho de acceso del paciente',
  'Resolución 1888 de 2025 — IHCE y Resumen Digital de Atención (RDA)',
] as const

export interface RdaCryptographicConsent {
  id: string
  patientId: string
  documentType: string
  documentNumber: string
  maskedPhone: string
  purpose: typeof RDA_CONSENT_PURPOSE
  consentedAt: string
  createdAt: string
  requestedByUserId?: string
  requestedByName?: string
  algorithm: typeof RDA_HASH_ALGORITHM
  /** SHA-256 del payload canónico (sin el PIN en claro). */
  contentHash: string
  legalBasis: string[]
}

export interface RdaDiagnosis {
  code: string
  description: string
  type: 'principal' | 'relacionado'
  certainty: 'impresion' | 'confirmado' | 'repetido'
}

export interface RdaProcedure {
  cupsCode: string
  description: string
  performedAt?: string
  prestadorOrigen?: string
}

export interface RdaExternalHistory {
  id: string
  patientId: string
  consentId: string
  source: typeof RDA_EXTERNAL_SOURCE
  receivedAt: string
  diagnoses: RdaDiagnosis[]
  procedures: RdaProcedure[]
  prestadorOrigen?: string
}

export interface RdaConsentHashPayload {
  patientId: string
  documentType: string
  documentNumber: string
  maskedPhone: string
  purpose: typeof RDA_CONSENT_PURPOSE
  consentedAt: string
  requestedByUserId: string | null
  otpVerified: true
}
