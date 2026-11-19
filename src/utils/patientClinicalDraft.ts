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
import type {
  ClinicalAuditSource,
  ClinicalDraftSaveResult,
  PatientClinicalDraft,
} from '@/types/patientClinicalDraft'
import { normalizeAnamnesis } from '@/types/anamnesis'
import { normalizeClinicalDiagnosticChart } from '@/types/clinicalDiagnosticChart'
import { keepStoredConsentSignatures } from '@/types/consent'
import { normalizeSpecializedAnnexes } from '@/types/specializedAnnexes'
import {
  clinicalFormHasContent,
  preserveEvolutionWorkflowStatus,
  shouldPersistClinicalDraft,
} from '../../shared/clinicalRecordGuard.js'
import { preferGeneralBudgetSections } from '../../shared/clinicalBudgetMerge.js'
import { mergeClinicalPaymentSections } from '../../shared/paymentControlMerge.js'
import {
  computeClinicalFormHash,
} from '../../shared/clinicalFormHash.js'
import { nextClinicalRevision } from '../../shared/clinicalRevision.js'
import { appendClinicalAuditLog } from './clinicalAuditLog'
import { sortEvolutionNotesChronologically } from './recordIntegrity'
import { getPatientByRouteId, toPatientForeignKey } from './patientId'
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

/**
 * Marca dirty para sync de metadatos/otras entidades.
 * El push (clinicSnapshotSync) omite clinicalDraft/valuationDraft >50 KB:
 * el formulario completo queda solo en Dexie local.
 */
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

/**
 * Clave canónica del borrador: preferir `patient.syncId`; si no hay, id de ruta.
 * Fusiona filas duplicadas (numérico vs UUID) al leer.
 */
export async function resolveCanonicalDraftPatientId(patientRouteId: string): Promise<{
  canonicalId: string
  patientSyncId: string
  aliases: string[]
}> {
  const routeKey = toPatientForeignKey(patientRouteId)
  const patient = await getPatientByRouteId(routeKey)
  const syncId = String(patient?.syncId || '').trim()
  const numericId =
    patient?.id != null
      ? String(patient.id)
      : /^\d+$/.test(routeKey)
        ? routeKey
        : ''
  const documentNumber = String(patient?.documentNumber || '').trim()
  const canonicalId = syncId || numericId || routeKey
  const aliases = [routeKey, syncId, numericId, documentNumber]
  if (documentNumber) {
    const twins = await db.patients
      .filter((row) => String(row.documentNumber || '').trim() === documentNumber)
      .toArray()
    for (const twin of twins) {
      if (twin.id != null) aliases.push(String(twin.id))
      const twinSync = String(twin.syncId || '').trim()
      if (twinSync) aliases.push(twinSync)
    }
  }
  return {
    canonicalId,
    patientSyncId: syncId || canonicalId,
    aliases: [...new Set(aliases.filter(Boolean))],
  }
}

function formRichness(value: unknown): number {
  if (value == null) return 0
  if (typeof value === 'string') return value.trim() ? Math.min(value.trim().length, 400) : 0
  if (typeof value === 'number') return Number.isFinite(value) && value !== 0 ? 1 : 0
  if (typeof value === 'boolean') return value ? 1 : 0
  if (Array.isArray(value)) return value.reduce((sum, item) => sum + formRichness(item), 0)
  if (typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).reduce(
      (sum, item) => sum + formRichness(item),
      0,
    )
  }
  return 0
}

/** Une dos formularios sin perder evoluciones, abonos, presupuesto ni la anamnesis más llena. */
function mergeClinicalForms(
  left: ClinicalRecordFormData | null | undefined,
  right: ClinicalRecordFormData | null | undefined,
): ClinicalRecordFormData | null {
  if (!left && !right) return null
  if (!left) return right ?? null
  if (!right) return left
  const anamnesis =
    formRichness(left.anamnesis) >= formRichness(right.anamnesis) ? left.anamnesis : right.anamnesis
  return {
    ...left,
    ...right,
    anamnesis,
    ...preferGeneralBudgetSections(left, right),
    ...mergeClinicalPaymentSections(left, right),
    ...preferSpecialtyBudgets(left, right),
    evolutionNotes: mergeDraftEvolutionNotes(
      right.evolutionNotes ?? [],
      left.evolutionNotes,
      [...(left.evolutionNotes ?? []), ...(right.evolutionNotes ?? [])],
    ),
    informedConsent: keepStoredConsentSignatures(left.informedConsent, right.informedConsent),
  }
}

function mergeDraftPair(left: PatientClinicalDraft, right: PatientClinicalDraft): PatientClinicalDraft {
  const leftStamp = String(left.clinicalUpdatedAt || left.updatedAt || '')
  const rightStamp = String(right.clinicalUpdatedAt || right.updatedAt || '')
  const newer = rightStamp >= leftStamp ? right : left
  const older = newer === right ? left : right
  return {
    ...older,
    ...newer,
    evolutionNotes: mergeDraftEvolutionNotes(
      newer.evolutionNotes ?? [],
      older.evolutionNotes,
      [...(older.evolutionNotes ?? []), ...(newer.evolutionNotes ?? [])],
    ),
    clinicalDraft: mergeClinicalForms(older.clinicalDraft, newer.clinicalDraft),
    valuationDraft: mergeClinicalForms(older.valuationDraft, newer.valuationDraft),
    odontogramDraft: newer.odontogramDraft ?? older.odontogramDraft ?? null,
    clinicalRevision: Math.max(Number(left.clinicalRevision) || 0, Number(right.clinicalRevision) || 0),
    contentHash: newer.contentHash || older.contentHash,
    patientSyncId: newer.patientSyncId || older.patientSyncId,
    updatedAt: newer.updatedAt || older.updatedAt || new Date().toISOString(),
  }
}

async function mergeDuplicateDraftRows(
  canonicalId: string,
  patientSyncId: string,
  aliases: string[],
): Promise<PatientClinicalDraft | undefined> {
  const rows: PatientClinicalDraft[] = []
  for (const key of aliases) {
    const row = await db.patientClinicalDrafts.get(key)
    if (row) rows.push(row)
  }
  if (rows.length === 0) return undefined

  rows.sort((a, b) => {
    const revDiff = (Number(b.clinicalRevision) || 0) - (Number(a.clinicalRevision) || 0)
    if (revDiff !== 0) return revDiff
    return String(b.clinicalUpdatedAt || b.updatedAt || '').localeCompare(
      String(a.clinicalUpdatedAt || a.updatedAt || ''),
    )
  })
  let merged = rows[0]
  for (const row of rows.slice(1)) merged = mergeDraftPair(merged, row)
  const winner: PatientClinicalDraft = {
    ...merged,
    patientId: canonicalId,
    patientSyncId: patientSyncId || merged.patientSyncId,
  }

  if (winner.patientId !== rows[0].patientId || rows.length > 1) {
    await db.patientClinicalDrafts.put(winner)
    for (const row of rows) {
      if (row.patientId !== canonicalId) {
        await db.patientClinicalDrafts.delete(row.patientId)
      }
    }
  }
  return winner
}

export async function getPatientClinicalDraft(
  patientRouteId: string,
): Promise<PatientClinicalDraft | undefined> {
  const { canonicalId, patientSyncId, aliases } =
    await resolveCanonicalDraftPatientId(patientRouteId)
  return mergeDuplicateDraftRows(canonicalId, patientSyncId, aliases)
}

/**
 * 1407, UUID y la misma cédula dejan de ser tres historias.
 * Conserva evoluciones, presupuestos, abonos y la anamnesis más completa
 * bajo `patient.syncId`.
 */
export async function reconcilePatientDraftKeys(patient: {
  id?: string | number | null
  syncId?: string | null
  documentNumber?: string | null
} | null | undefined): Promise<string> {
  if (!patient) return ''
  const routeKey = String(patient.syncId || patient.id || '').trim()
  if (!routeKey) return ''
  const { canonicalId, patientSyncId, aliases } = await resolveCanonicalDraftPatientId(routeKey)
  await mergeDuplicateDraftRows(canonicalId, patientSyncId, aliases)
  const aliasSet = new Set(aliases)

  const records = await db.clinicalRecords.toArray()
  for (const record of records) {
    const key = String(record.patientId ?? '')
    if (!aliasSet.has(key) || key === canonicalId || record.id == null) continue
    await db.clinicalRecords.update(record.id, { patientId: canonicalId })
  }

  const logs = await db.clinicalAuditLogs.toArray()
  for (const log of logs) {
    const key = String(log.patientSyncId || '')
    if (!aliasSet.has(key) || key === canonicalId) continue
    await db.clinicalAuditLogs.update(log.id, { patientSyncId: canonicalId })
  }

  return canonicalId
}

/**
 * Elige el formulario vivo: un clinicalDraft vacío/fino no debe tapar valuationDraft
 * (motivo, diagnósticos, presupuesto de valoración).
 */
export function pickLivingDraftForm(
  clinicalDraft: ClinicalRecordFormData | null | undefined,
  valuationDraft: ClinicalRecordFormData | null | undefined,
): ClinicalRecordFormData | null {
  const hasClinical = clinicalFormHasContent(clinicalDraft)
  const hasValuation = clinicalFormHasContent(valuationDraft)
  if (hasClinical && hasValuation && clinicalDraft && valuationDraft) {
    return {
      ...valuationDraft,
      ...clinicalDraft,
      anamnesis: hasAnamnesisPrefer(valuationDraft, clinicalDraft),
      diagnoses:
        Array.isArray(clinicalDraft.diagnoses) && clinicalDraft.diagnoses.length > 0
          ? clinicalDraft.diagnoses
          : valuationDraft.diagnoses,
      treatmentPlan:
        Array.isArray(clinicalDraft.treatmentPlan) && clinicalDraft.treatmentPlan.length > 0
          ? clinicalDraft.treatmentPlan
          : valuationDraft.treatmentPlan,
      ...mergeClinicalPaymentSections(valuationDraft, clinicalDraft),
      ...preferGeneralBudgetSections(valuationDraft, clinicalDraft),
      ...preferSpecialtyBudgets(valuationDraft, clinicalDraft),
    }
  }
  if (hasValuation && valuationDraft) return valuationDraft
  if (hasClinical && clinicalDraft) return clinicalDraft
  return clinicalDraft ?? valuationDraft ?? null
}

function hasAnamnesisPrefer(
  valuationDraft: ClinicalRecordFormData,
  clinicalDraft: ClinicalRecordFormData,
) {
  // Preferir anamnesis con contenido real (motivo de consulta de valoración).
  const v = valuationDraft.anamnesis
  const c = clinicalDraft.anamnesis
  const vText = typeof v?.chiefComplaint === 'string' ? v.chiefComplaint.trim() : ''
  const cText = typeof c?.chiefComplaint === 'string' ? c.chiefComplaint.trim() : ''
  if (vText && !cText) return v
  if (cText) return c
  return c ?? v
}

async function persistDraftRow(
  patientRouteId: string,
  patch: {
    clinicalDraft?: ClinicalRecordFormData | null
    valuationDraft?: ClinicalRecordFormData | null
    odontogramDraft?: OdontogramData | null
    evolutionNotes?: EvolutionNote[]
  },
  options?: { source?: ClinicalAuditSource; previousForm?: unknown },
): Promise<ClinicalDraftSaveResult> {
  const { canonicalId, patientSyncId, aliases } =
    await resolveCanonicalDraftPatientId(patientRouteId)
  const existing = await mergeDuplicateDraftRows(canonicalId, patientSyncId, aliases)
  const now = new Date().toISOString()
  const livingForm =
    patch.clinicalDraft ??
    patch.valuationDraft ??
    existing?.clinicalDraft ??
    existing?.valuationDraft ??
    null
  const contentHash = computeClinicalFormHash(livingForm)
  const clinicalRevision = nextClinicalRevision(existing)

  const next: PatientClinicalDraft = {
    patientId: canonicalId,
    patientSyncId,
    evolutionNotes: patch.evolutionNotes ?? existing?.evolutionNotes ?? [],
    valuationDraft:
      patch.valuationDraft !== undefined
        ? patch.valuationDraft
        : (existing?.valuationDraft ?? null),
    clinicalDraft:
      patch.clinicalDraft !== undefined ? patch.clinicalDraft : (existing?.clinicalDraft ?? null),
    odontogramDraft:
      patch.odontogramDraft !== undefined
        ? patch.odontogramDraft
        : (existing?.odontogramDraft ?? null),
    clinicalRevision,
    clinicalUpdatedAt: now,
    administrativeUpdatedAt: existing?.administrativeUpdatedAt,
    contentHash,
    syncStatus: 'pending',
    syncError: null,
    updatedAt: now,
  }

  try {
    await db.transaction('rw', db.patientClinicalDrafts, async () => {
      await db.patientClinicalDrafts.put(next)
      for (const alias of aliases) {
        if (alias !== canonicalId) await db.patientClinicalDrafts.delete(alias)
      }
    })
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Error al escribir IndexedDB'
    return { ok: false, reason }
  }

  notifyDraftChanged()
  void appendClinicalAuditLog({
    patientSyncId,
    clinicalRevision,
    contentHash,
    previousForm: options?.previousForm,
    nextForm: livingForm,
    source: options?.source ?? 'autosave',
  })

  return { ok: true, clinicalRevision, contentHash, patientId: canonicalId }
}

export async function savePatientValuationDraft(
  patientRouteId: string,
  valuationDraft: ClinicalRecordFormData,
  options?: { source?: ClinicalAuditSource },
): Promise<ClinicalDraftSaveResult> {
  const existing = await getPatientClinicalDraft(patientRouteId)
  const normalizedValuation = normalizeClinicalDraft(valuationDraft)
  if (!shouldPersistClinicalDraft(existing?.valuationDraft, normalizedValuation)) {
    return { ok: false, reason: 'Guard rechazó un borrador vacío sobre historia con contenido' }
  }

  return persistDraftRow(
    patientRouteId,
    {
      valuationDraft: {
        ...normalizedValuation,
        ...mergeClinicalPaymentSections(existing?.valuationDraft, normalizedValuation),
        ...preferGeneralBudgetSections(existing?.valuationDraft, normalizedValuation),
        ...preferSpecialtyBudgets(existing?.valuationDraft, normalizedValuation),
        informedConsent: keepStoredConsentSignatures(
          existing?.valuationDraft?.informedConsent,
          normalizedValuation.informedConsent,
        ),
      },
      clinicalDraft: existing?.clinicalDraft ?? null,
      odontogramDraft: existing?.odontogramDraft ?? null,
      evolutionNotes: existing?.evolutionNotes ?? [],
    },
    { source: options?.source ?? 'autosave', previousForm: existing?.valuationDraft },
  )
}

export async function savePatientClinicalDraft(
  patientRouteId: string,
  clinicalDraft: ClinicalRecordFormData,
  odontogramDraft?: OdontogramData | null,
  options?: { source?: ClinicalAuditSource },
): Promise<ClinicalDraftSaveResult> {
  const existing = await getPatientClinicalDraft(patientRouteId)
  const normalized = normalizeClinicalDraft(clinicalDraft)
  if (!shouldPersistClinicalDraft(existing?.clinicalDraft ?? existing, normalized)) {
    return { ok: false, reason: 'Guard rechazó un borrador vacío sobre historia con contenido' }
  }

  return persistDraftRow(
    patientRouteId,
    {
      clinicalDraft: {
        ...normalized,
        ...mergeClinicalPaymentSections(existing?.clinicalDraft, normalized),
        ...preferGeneralBudgetSections(existing?.clinicalDraft, normalized),
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
      valuationDraft: existing?.valuationDraft ?? null,
      odontogramDraft: odontogramDraft ?? existing?.odontogramDraft ?? null,
      evolutionNotes: mergeDraftEvolutionNotes(
        normalized.evolutionNotes ?? [],
        existing?.clinicalDraft?.evolutionNotes,
        existing?.evolutionNotes,
      ),
    },
    { source: options?.source ?? 'autosave', previousForm: existing?.clinicalDraft },
  )
}

export async function markPatientClinicalDraftSynced(
  patientRouteId: string,
  acceptedRevision?: number,
): Promise<void> {
  const existing = await getPatientClinicalDraft(patientRouteId)
  if (!existing) return
  if (
    acceptedRevision != null &&
    Number.isFinite(acceptedRevision) &&
    (existing.clinicalRevision || 0) > acceptedRevision
  ) {
    return
  }
  await db.patientClinicalDrafts.put({
    ...existing,
    syncStatus: 'synced',
    syncError: null,
    administrativeUpdatedAt: new Date().toISOString(),
  })
}

export async function markPatientClinicalDraftSyncError(
  patientRouteId: string,
  reason: string,
): Promise<void> {
  const existing = await getPatientClinicalDraft(patientRouteId)
  if (!existing) return
  await db.patientClinicalDrafts.put({
    ...existing,
    syncStatus: 'error',
    syncError: reason,
    administrativeUpdatedAt: new Date().toISOString(),
  })
}

export async function appendPatientEvolutionNote(
  patientRouteId: string,
  note: EvolutionNote,
): Promise<ClinicalDraftSaveResult> {
  const existing = await getPatientClinicalDraft(patientRouteId)
  const evolutionNotes = sortEvolutionNotesChronologically([
    ...(existing?.evolutionNotes ?? []),
    note,
  ])

  return persistDraftRow(
    patientRouteId,
    {
      evolutionNotes,
      valuationDraft: existing?.valuationDraft ?? null,
      clinicalDraft: existing?.clinicalDraft ?? null,
      odontogramDraft: existing?.odontogramDraft ?? null,
    },
    { source: 'manual_flush', previousForm: existing?.clinicalDraft },
  )
}

export async function clearPatientClinicalDraft(patientRouteId: string): Promise<void> {
  const { aliases } = await resolveCanonicalDraftPatientId(patientRouteId)
  for (const key of aliases) {
    await db.patientClinicalDrafts.delete(key)
  }
}
