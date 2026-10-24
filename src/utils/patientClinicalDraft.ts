import { db } from '@/db/database'
import {
  isApplyingRemotePull,
  notifyClinicalRecordDirty,
} from '@/services/clinicalSyncState'
import type { EvolutionNote } from '@/types/evolutionNote'
import { isEvolutionNoteImmutable, retainSignedEvolutionBody } from '@/types/evolutionNote'
import type { ClinicalRecordFormData } from '@/types/clinicalRecord'
import type { OdontogramData } from '@/types/odontogram'
import type { PatientClinicalDraft } from '@/types/patientClinicalDraft'
import { normalizeAnamnesis } from '@/types/anamnesis'
import { normalizeClinicalDiagnosticChart } from '@/types/clinicalDiagnosticChart'
import { keepStoredConsentSignatures } from '@/types/consent'
import { shouldPersistClinicalDraft } from '../../shared/clinicalRecordGuard.js'
import { sortEvolutionNotesChronologically } from './recordIntegrity'
import { toPatientForeignKey } from './patientId'

function preserveImmutableEvolutionNotes(
  incoming: EvolutionNote[],
  existing: EvolutionNote[] | undefined,
): EvolutionNote[] {
  const signedSnapshots = new Map(
    (existing ?? []).filter(isEvolutionNoteImmutable).map((note) => [note.id, note]),
  )
  return incoming.map((note) => {
    const signed = signedSnapshots.get(note.id)
    return signed ? retainSignedEvolutionBody(signed, note) : note
  })
}

function normalizeClinicalDraft(draft: ClinicalRecordFormData): ClinicalRecordFormData {
  return {
    ...draft,
    anamnesis: normalizeAnamnesis(draft.anamnesis),
    diagnosticChart: normalizeClinicalDiagnosticChart(draft.diagnosticChart),
    evolutionNotes: sortEvolutionNotesChronologically(draft.evolutionNotes ?? []),
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
