import type { ClinicalRecord } from './clinicalRecord'
import type { Patient } from './patient'
import type { DigitalSignature } from './signature'

export const PORTABILITY_FORMAT = 'dental-emr-clinical-history-export'
export const PORTABILITY_VERSION = 2

export type ClinicalHistoryExportFormat = 'json' | 'fhir' | 'xml' | 'html'

export const EXPORT_FORMAT_LABELS: Record<ClinicalHistoryExportFormat, string> = {
  json: 'JSON (intercambio estructurado)',
  fhir: 'FHIR R4 (IHCE / interoperabilidad)',
  xml: 'XML (intercambio universal)',
  html: 'Informe legible (PDF vía impresión)',
}

export const LEGAL_FRAMEWORK = [
  'Ley 23 de 1981 — Historia clínica y derecho de acceso del paciente',
  'Ley 1581 de 2012 — Protección de datos y portabilidad',
  'Ley 527 de 1999 — Validez de mensajes de datos y firma electrónica',
  'Resolución 1995 de 1999 — Historia clínica (contenido mínimo)',
  'Resolución 1888 de 2025 — IHCE y Resumen Digital de Atención (RDA)',
] as const

export interface CustodyChainEntry {
  step: 'clinical_signature' | 'export_generation'
  recordId?: string
  timestamp: string
  contentHash?: string
  signedBy?: string
  description: string
}

export interface PortabilityManifest {
  exportId: string
  exportedAt: string
  purpose: 'exportacion_historia_clinica' | 'resumen_digital_atencion'
  legalBasis: typeof LEGAL_FRAMEWORK
  exportedBy: {
    id: string
    name: string
    email: string
    role: string
    documentNumber?: string
    clinicName?: string
    providerNit?: string
  } | null
  patient: {
    documentType: string
    documentNumber: string
    fullName: string
  }
  recordCount: number
  integrityVerified: boolean
  packageHash: string
  algorithm: 'SHA-256'
}

export interface IntegrityRecordReport {
  recordId: string
  signedAt?: string
  valid: boolean
  storedHash?: string
  computedHash: string
}

export interface ClinicalHistoryExportPackage {
  format: typeof PORTABILITY_FORMAT
  version: number
  manifest: PortabilityManifest
  patient: Patient
  odontogram: unknown | null
  clinicalRecords: ClinicalRecord[]
  signatures: DigitalSignature[]
  integrityReport: IntegrityRecordReport[]
  custodyChain: CustodyChainEntry[]
}
