import { db } from '@/db/database'
import {
  isApplyingRemotePull,
  notifyClinicalRecordDirty,
} from '@/services/clinicalSyncState'
import {
  corregirFechasSesionClinica,
  isEvolutionNoteImmutable,
  retainSignedEvolutionBody,
  type EvolutionNote,
} from '@/types/evolutionNote'
import type {
  ClinicalRecordFormData,
  DentalImplantsBudget,
  OrthodonticsBudget,
} from '@/types/clinicalRecord'
import type { OdontogramData } from '@/types/odontogram'
import type { PatientClinicalDraft } from '@/types/patientClinicalDraft'
import { normalizeAnamnesis } from '@/types/anamnesis'
import { normalizeClinicalDiagnosticChart } from '@/types/clinicalDiagnosticChart'
import { keepStoredConsentSignatures } from '@/types/consent'
import { normalizeSpecializedAnnexes } from '@/types/specializedAnnexes'
import {
  preserveEvolutionWorkflowStatus,
  shouldPersistClinicalDraft,
} from '../../shared/clinicalRecordGuard.js'
import { mergeClinicalPaymentSections } from '../../shared/paymentControlMerge.js'
import { sortEvolutionNotesChronologically } from './recordIntegrity'
import { toPatientForeignKey } from './patientId'
import {
  lineSubtotal,
  normalizeDentalImplantsBudget,
  normalizeOrthodonticsBudget,
} from './budget'
import { collapseLegacyRehabBudgetVisualLines } from '@/utils/rehabAnnexBudget'
import { collapseTreatmentPlanByProcedure } from '@/utils/treatmentPlanCollapse'

/** Suma montos de líneas; no exige `active` (desactivar conserva precios). */
function orthodonticsMonetaryTotal(budget: OrthodonticsBudget | undefined): number {
  const normalized = normalizeOrthodonticsBudget(budget)
  return (
    lineSubtotal(normalized.initialInstallment) +
    lineSubtotal(normalized.controls) +
    lineSubtotal(normalized.retainers)
  )
}

function dentalImplantsMonetaryTotal(budget: DentalImplantsBudget | undefined): number {
  const normalized = normalizeDentalImplantsBudget(budget)
  return (
    lineSubtotal(normalized.implantPlacement) + lineSubtotal(normalized.prosthetics)
  )
}

/**
 * Un autoguardado vacío no puede borrar el presupuesto de ortodoncia/implantes
 * ya capturado (documento legal).
 */
function preferSpecialtyBudgets(
  existing: ClinicalRecordFormData | null | undefined,
  incoming: ClinicalRecordFormData,
): Pick<ClinicalRecordFormData, 'orthodonticsBudget' | 'dentalImplantsBudget'> {
  const nextOrtho = normalizeOrthodonticsBudget(incoming.orthodonticsBudget)
  const prevOrtho = normalizeOrthodonticsBudget(existing?.orthodonticsBudget)
  const nextImplants = normalizeDentalImplantsBudget(incoming.dentalImplantsBudget)
  const prevImplants = normalizeDentalImplantsBudget(existing?.dentalImplantsBudget)

  return {
    orthodonticsBudget:
      orthodonticsMonetaryTotal(prevOrtho) > 0 && orthodonticsMonetaryTotal(nextOrtho) === 0
        ? prevOrtho
        : nextOrtho,
    dentalImplantsBudget:
      dentalImplantsMonetaryTotal(prevImplants) > 0 &&
      dentalImplantsMonetaryTotal(nextImplants) === 0
        ? prevImplants
        : nextImplants,
  }
}

function preserveImmutableEvolutionNotes(
  incoming: EvolutionNote[],
  existing: EvolutionNote[] | undefined,
): EvolutionNote[] {
  const signedSnapshots = new Map(
    (existing ?? []).filter(isEvolutionNoteImmutable).map((note) => [note.id, note]),
  )
  const merged = incoming.map((note) => {
    const signed = signedSnapshots.get(note.id)
    return signed ? retainSignedEvolutionBody(signed, note) : note
  })
  return preserveEvolutionWorkflowStatus(existing, merged) as EvolutionNote[]
}

function normalizeClinicalDraft(draft: ClinicalRecordFormData): ClinicalRecordFormData {
  const annexes = normalizeSpecializedAnnexes(draft.specializedAnnexes)
  const rehab = annexes.rehabilitationAesthetics
  return {
    ...draft,
    anamnesis: normalizeAnamnesis(draft.anamnesis),
    diagnosticChart: normalizeClinicalDiagnosticChart(draft.diagnosticChart),
    specializedAnnexes: rehab
      ? {
          ...annexes,
          rehabilitationAesthetics: {
            ...rehab,
            budget: collapseLegacyRehabBudgetVisualLines(rehab.budget),
          },
        }
      : annexes,
    treatmentPlan: collapseTreatmentPlanByProcedure(draft.treatmentPlan),
    evolutionNotes: sortEvolutionNotesChronologically(
      corregirFechasSesionClinica(draft.evolutionNotes ?? []),
    ),
  }
}

function mergeDraftEvolutionNotes(
  incoming: EvolutionNote[],
  existing: EvolutionNote[] | undefined,
  topLevel: EvolutionNote[] | undefined,
): EvolutionNote[] {
  const preserved = preserveImmutableEvolutionNotes(incoming, existing)
  const merged = sortEvolutionNotesChronologically([
    ...preserved,
    ...(topLevel ?? []).filter(
      (note) => !preserved.some((item) => item.id === note.id),
    ),
  ])
  return preserveImmutableEvolutionNotes(merged, existing)
}

function notifyDraftChanged(): void {
  if (isApplyingRemotePull()) return
  notifyClinicalRecordDirty()
}

function notasConRelojClinico(
  notes: EvolutionNote[] | null | undefined,
): EvolutionNote[] | null | undefined {
  if (!notes?.length) return notes
  const next = corregirFechasSesionClinica(notes)
  return next === notes ? notes : next
}

/**
 * Reescribe solo la fecha de sesión de borradores que todavía tienen el reloj UTC.
 * No sustituye el resto de la historia ni toca una nota ya firmada.
 */
export async function persistCorrectedEvolutionSessionClocks(
  patientRouteId: string,
): Promise<boolean> {
  const patientId = toPatientForeignKey(patientRouteId)
  const existing = await db.patientClinicalDrafts.get(patientId)
  if (!existing) return false

  const evolutionNotes = notasConRelojClinico(existing.evolutionNotes) ?? existing.evolutionNotes
  const clinicalNotes = notasConRelojClinico(existing.clinicalDraft?.evolutionNotes)
  const valuationNotes = notasConRelojClinico(existing.valuationDraft?.evolutionNotes)
  const topChanged = evolutionNotes !== existing.evolutionNotes
  const clinicalChanged = Boolean(
    existing.clinicalDraft && clinicalNotes !== existing.clinicalDraft.evolutionNotes,
  )
  const valuationChanged = Boolean(
    existing.valuationDraft && valuationNotes !== existing.valuationDraft.evolutionNotes,
  )
  if (!topChanged && !clinicalChanged && !valuationChanged) return false

  await db.patientClinicalDrafts.put({
    ...existing,
    evolutionNotes,
    clinicalDraft:
      clinicalChanged && existing.clinicalDraft
        ? { ...existing.clinicalDraft, evolutionNotes: clinicalNotes ?? [] }
        : existing.clinicalDraft,
    valuationDraft:
      valuationChanged && existing.valuationDraft
        ? { ...existing.valuationDraft, evolutionNotes: valuationNotes ?? [] }
        : existing.valuationDraft,
    updatedAt: new Date().toISOString(),
  })
  notifyDraftChanged()
  return true
}

export async function getPatientClinicalDraft(
  patientRouteId: string,
): Promise<PatientClinicalDraft | undefined> {
  const patientId = toPatientForeignKey(patientRouteId)
  return db.patientClinicalDrafts.get(patientId)
}

export async function savePatientValuationDraft(
  patientRouteId: string,
  valuationDraft: ClinicalRecordFormData,
): Promise<void> {
  const patientId = toPatientForeignKey(patientRouteId)
  const existing = await db.patientClinicalDrafts.get(patientId)
  const now = new Date().toISOString()
  const normalizedValuation = normalizeClinicalDraft(valuationDraft)
  if (!shouldPersistClinicalDraft(existing?.valuationDraft, normalizedValuation)) return

  await db.patientClinicalDrafts.put({
    patientId,
    evolutionNotes: existing?.evolutionNotes ?? [],
    valuationDraft: {
      ...normalizedValuation,
      ...mergeClinicalPaymentSections(existing?.valuationDraft, normalizedValuation),
      ...preferSpecialtyBudgets(existing?.valuationDraft, normalizedValuation),
      informedConsent: keepStoredConsentSignatures(
        existing?.valuationDraft?.informedConsent,
        normalizedValuation.informedConsent,
      ),
    },
    clinicalDraft: existing?.clinicalDraft ?? null,
    odontogramDraft: existing?.odontogramDraft ?? null,
    updatedAt: now,
  })
  notifyDraftChanged()
}

export async function savePatientClinicalDraft(
  patientRouteId: string,
  clinicalDraft: ClinicalRecordFormData,
  odontogramDraft?: OdontogramData | null,
): Promise<void> {
  const patientId = toPatientForeignKey(patientRouteId)
  const existing = await db.patientClinicalDrafts.get(patientId)
  const now = new Date().toISOString()
  const normalized = normalizeClinicalDraft(clinicalDraft)
  if (!shouldPersistClinicalDraft(existing?.clinicalDraft ?? existing, normalized)) return

  await db.patientClinicalDrafts.put({
    patientId,
    evolutionNotes: mergeDraftEvolutionNotes(
      normalized.evolutionNotes ?? [],
      existing?.clinicalDraft?.evolutionNotes,
      existing?.evolutionNotes,
    ),
    valuationDraft: existing?.valuationDraft ?? null,
    clinicalDraft: {
      ...normalized,
      // Abonos legales: el React state de una terminal no puede borrar
      // pagos que otra terminal ya dejó en IndexedDB.
      ...mergeClinicalPaymentSections(existing?.clinicalDraft, normalized),
      ...preferSpecialtyBudgets(existing?.clinicalDraft, normalized),
      informedConsent: keepStoredConsentSignatures(
        existing?.clinicalDraft?.informedConsent,
        normalized.informedConsent,
      ),
      evolutionNotes: preserveImmutableEvolutionNotes(
        normalized.evolutionNotes ?? [],
        existing?.clinicalDraft?.evolutionNotes,
      ),
    },
    odontogramDraft: odontogramDraft ?? existing?.odontogramDraft ?? null,
    updatedAt: now,
  })
  notifyDraftChanged()
}

export async function appendPatientEvolutionNote(
  patientRouteId: string,
  note: EvolutionNote,
): Promise<void> {
  const patientId = toPatientForeignKey(patientRouteId)
  const existing = await db.patientClinicalDrafts.get(patientId)
  const now = new Date().toISOString()

  const evolutionNotes = sortEvolutionNotesChronologically([
    ...(existing?.evolutionNotes ?? []),
    note,
  ])

  await db.patientClinicalDrafts.put({
    patientId,
    evolutionNotes,
    valuationDraft: existing?.valuationDraft ?? null,
    clinicalDraft: existing?.clinicalDraft ?? null,
    odontogramDraft: existing?.odontogramDraft ?? null,
    updatedAt: now,
  })
  notifyDraftChanged()
}

export async function clearPatientClinicalDraft(patientRouteId: string): Promise<void> {
  const patientId = toPatientForeignKey(patientRouteId)
  await db.patientClinicalDrafts.delete(patientId)
}
