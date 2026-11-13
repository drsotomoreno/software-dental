import type { ValuationConsentMetadata } from '@/types/valuationConsent'

/** Tipos de documento según normativa colombiana */
export type DocumentType = 'CC' | 'TI' | 'CE' | 'PA' | 'RC' | 'NIT'

export type RegimeType = 'contributivo' | 'subsidiado' | 'especial' | 'particular'

/** Fase del flujo clínico del paciente */
export type PatientPhase = 'VALORACION_RAPIDA' | 'TRATAMIENTO_ACEPTADO'

export const DEFAULT_PATIENT_PHASE: PatientPhase = 'VALORACION_RAPIDA'

export const PATIENT_PHASE_LABELS: Record<PatientPhase, string> = {
  VALORACION_RAPIDA: 'Valoración rápida',
  TRATAMIENTO_ACEPTADO: 'Tratamiento aceptado',
}

export function normalizePatientPhase(phase?: PatientPhase | string | null): PatientPhase {
  return phase === 'TRATAMIENTO_ACEPTADO' ? 'TRATAMIENTO_ACEPTADO' : DEFAULT_PATIENT_PHASE
}

/**
 * Pacientes Valorados (EC2): valuationOnly=true o phase=VALORACION_RAPIDA.
 * No depende de status (en sync suele venir null).
 * valuationOnly=false (historia completa) nunca entra aquí.
 */
export function isValuatedOnlyPatient(
  patient: Pick<Patient, 'valuationOnly' | 'phase' | 'treatmentCompleted'>,
): boolean {
  if (patient.treatmentCompleted === true) return false
  if (patient.valuationOnly === false) return false
  return patient.valuationOnly === true || patient.phase === 'VALORACION_RAPIDA'
}

export function isCompletedPatient(patient: Pick<Patient, 'treatmentCompleted'>): boolean {
  return patient.treatmentCompleted === true
}

export function isActivePatient(
  patient: Pick<Patient, 'valuationOnly' | 'phase' | 'treatmentCompleted'>,
): boolean {
  return !isValuatedOnlyPatient(patient) && !isCompletedPatient(patient)
}

export interface Patient {
  /** Clave primaria Dexie (++id → number) o string si se asigna manualmente */
  id?: number | string
  /** Identificador FHIR: Patient.identifier */
  documentType: DocumentType
  documentNumber: string
  firstName: string
  lastName: string
  birthDate: string
  gender: 'M' | 'F' | 'O'
  phone: string
  email?: string
  address?: string
  city?: string
  /** EPS / aseguradora — requerido para RIPS */
  insurer?: string
  regime?: RegimeType
  /** Código municipio DANE */
  municipalityCode?: string
  occupation?: string
  companionName?: string
  companionPhone?: string
  companionRelationship?: string
  /** Fase del flujo clínico — valoración inicial o tratamiento detallado */
  phase?: PatientPhase
  /** Consentimiento de valoración rápida — metadatos legales */
  valuationConsent?: ValuationConsentMetadata
  /** Solo valoración: aparece en Pacientes Valorados hasta pasar a historia completa */
  valuationOnly?: boolean
  /** Tratamiento finalizado: aparece en Pacientes Terminados */
  treatmentCompleted?: boolean
  createdAt: string
  updatedAt: string
  /** Cuenta de suscripción que creó el paciente (límites de prueba). */
  ownerUserId?: string
  /** Identidad estable entre dispositivos (no es el id Dexie). */
  syncId?: string
  /** Clínica dueña del registro para el pull multi-dispositivo. */
  clinicId?: string
  /** true = hay cambios locales aún no confirmados por el servidor. */
  pendingSync?: boolean
  lastSyncedAt?: string
  /** Firma de registro / habeas data capturada en la tableta kiosco. */
  kioskIntakeSignature?: KioskIntakeSignature | null
}

/** Estampado legal de la firma de ingreso hecha en la tableta. */
export interface KioskIntakeSignature {
  patientSignatureDataUrl: string
  signedAt: string
  signerName: string
  signerDocument: string
  signerIsGuardian?: boolean
  ipAddress?: string
  kioskDeviceId?: string
}

export interface PatientFormData extends Omit<Patient, 'id' | 'createdAt' | 'updatedAt'> {}
