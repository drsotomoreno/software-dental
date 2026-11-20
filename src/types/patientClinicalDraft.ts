import type { EvolutionNote } from './evolutionNote'
import type { ClinicalRecordFormData } from './clinicalRecord'
import type { OdontogramData } from './odontogram'

export type ClinicalDraftSyncStatus = 'pending' | 'synced' | 'error'

/** Borrador clínico pendiente de firma — evolución desde agenda u otros flujos. */
export interface PatientClinicalDraft {
  patientId: string
  /** syncId canónico del paciente cuando se conoce (clave preferida / dedupe). */
  patientSyncId?: string
  evolutionNotes: EvolutionNote[]
  /** Borrador de valoración rápida (solo valoración) */
  valuationDraft?: ClinicalRecordFormData | null
  /** Borrador completo de historia clínica en edición (autoguardado) */
  clinicalDraft?: ClinicalRecordFormData | null
  /** Odontograma asociado al borrador clínico */
  odontogramDraft?: OdontogramData | null
  /**
   * Contador monotónico de ediciones clínicas del profesional.
   * RIPS / admin NO deben incrementarlo.
   */
  clinicalRevision?: number
  /** Marca de tiempo de la última edición clínica (no administrativa). */
  clinicalUpdatedAt?: string
  /**
   * Reloj administrativo (RIPS, kiosk, sync). No decide hidratación vs draft.
   */
  administrativeUpdatedAt?: string
  /** Hash FNV del formulario clínico editable. */
  contentHash?: string
  /** Cola de sync del borrador vivo. */
  syncStatus?: ClinicalDraftSyncStatus
  syncError?: string | null
  updatedAt: string
}

export type ClinicalDraftSaveResult =
  | {
      ok: true
      clinicalRevision: number
      contentHash: string
      patientId: string
    }
  | {
      ok: false
      reason: string
    }

export type ClinicalAuditSource =
  | 'autosave'
  | 'manual_flush'
  | 'emergency_recovery'
  | 'sync_pull'
  | 'sync_push_ack'

export interface ClinicalAuditLogEntry {
  id: string
  patientSyncId: string
  clinicaId: string
  userId: string
  userEmail: string
  clinicalRevision: number
  contentHash: string
  changedSections: string[]
  source: ClinicalAuditSource
  createdAt: string
  /**
   * Snapshot médico-legal de plan/presupuesto cuando esas secciones cambian.
   * No indexado; se sincroniza con clinical_audit_logs.
   */
  beforeSnapshot?: {
    treatmentPlan?: unknown
    budgetItems?: unknown
    budget?: unknown
  } | null
  afterSnapshot?: {
    treatmentPlan?: unknown
    budgetItems?: unknown
    budget?: unknown
  } | null
}
