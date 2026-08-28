import type { EvolutionNote } from './evolutionNote'
import type { ClinicalRecordFormData } from './clinicalRecord'
import type { OdontogramData } from './odontogram'

/** Borrador clínico pendiente de firma — evolución desde agenda u otros flujos. */
export interface PatientClinicalDraft {
  patientId: string
  evolutionNotes: EvolutionNote[]
  /** Borrador de valoración rápida (solo valoración) */
  valuationDraft?: ClinicalRecordFormData | null
  /** Borrador completo de historia clínica en edición (autoguardado) */
  clinicalDraft?: ClinicalRecordFormData | null
  /** Odontograma asociado al borrador clínico */
  odontogramDraft?: OdontogramData | null
  updatedAt: string
}