import type { ClinicalDiagnosticChart } from '@/types/clinicalDiagnosticChart'
import type { Cie10Diagnosis } from '@/types/clinicalRecord'
import type { EvolutionNote } from '@/types/evolutionNote'
import { keepStoredConsentSignatures } from '../types/consent.ts'
import type { OdontogramData } from '@/types/odontogram'
import {
  anamnesisHasContent,
  informedConsentHasContent,
  mergeSignedEvolutionNotes,
  specializedAnnexesHaveContent,
  stomatologicalExamHasContent,
  treatmentPlanHasContent,
} from '../../shared/clinicalRecordGuard.js'
import { preferGeneralBudgetSections } from '../../shared/clinicalBudgetMerge.js'
import { ensureEvolutionNoteIds } from '../../shared/evolutionNoteIds.js'
import { mergeClinicalPaymentSections } from '../../shared/paymentControlMerge.js'
import { isRemoteDraftNewer } from './clinicalDraftMerge.ts'

export function odontogramHasMarks(data: OdontogramData | null | undefined): boolean {
  if (!data) return false
  if (data.edentulismScope) return true

  const findings = data.supplementaryFindings
  if (findings) {
    for (const finding of Object.values(findings)) {
      if (!finding) continue
      if (finding.present || finding.description?.trim()) return true
    }
  }

  return (data.teeth ?? []).some((tooth) => {
    if (tooth.globalState && tooth.globalState !== 'presente') return true
    const faces = tooth.faces
    if (!faces) return false
    return Object.values(faces).some((face) => face && face !== 'sano')
  })
}

/**
 * Elige el odontograma que debe verse. Una copia más nueva y vacía no pisa
 * las marcas ya hechas. A igual fecha, se quedan las marcas.
 */
export function pickOdontogram(
  current: OdontogramData | null | undefined,
  incoming: OdontogramData | null | undefined,
): OdontogramData | null {
  if (!incoming) return current ?? null
  if (!current) return incoming

  const incomingNewer = isRemoteDraftNewer(current.updatedAt, incoming.updatedAt)
  const currentMarks = odontogramHasMarks(current)
  const incomingMarks = odontogramHasMarks(incoming)

  if (!incomingNewer) {
    if (!currentMarks && incomingMarks) return incoming
    return current
  }

  if (currentMarks && !incomingMarks) return current
  return incoming
}

export function pickOdontogramFromCandidates(
  candidates: Array<OdontogramData | null | undefined>,
): OdontogramData | null {
  return candidates.reduce<OdontogramData | null>(
    (best, candidate) => pickOdontogram(best, candidate),
    null,
  )
}

interface LivingChart {
  diagnoses?: Cie10Diagnosis[]
  diagnosticChart?: ClinicalDiagnosticChart
  findings?: string
}

function livingChartHasContent(data: LivingChart | null | undefined): boolean {
  return hasDiagnoses(data) || hasChartEntries(data) || Boolean(data?.findings?.trim())
}

function hasDiagnoses(data: LivingChart | null | undefined): boolean {
  return (data?.diagnoses?.length ?? 0) > 0
}

function hasChartEntries(data: LivingChart | null | undefined): boolean {
  return (data?.diagnosticChart?.entries?.length ?? 0) > 0
}

function notesOf(value: unknown): unknown[] | undefined {
  if (!value || typeof value !== 'object' || !('evolutionNotes' in value)) return undefined
  const notes = (value as { evolutionNotes?: unknown[] }).evolutionNotes
  return Array.isArray(notes) ? notes : undefined
}

/**
 * Ficha viva (`draft`) vs historia firmada (`base`).
 *
 * Res. 1995 / offline-first: si el borrador tiene contenido clínico, es la única
 * fuente de verdad editable. `draftIsNewer` / `signedRecord.updatedAt` YA NO
 * descartan anamnesis, examen, anexos, plan, consentimientos ni presupuestos.
 * La firmada solo aporta evoluciones selladas y firmas cuando el draft no las tiene.
 *
 * El 3.er argumento se conserva por compatibilidad de llamadas; se ignora al
 * decidir prioridad de secciones con contenido.
 */
export function mergeLivingChart<T extends LivingChart>(
  base: T,
  draft: T | null | undefined,
  _draftIsNewer = true,
): T {
  if (!draft) return base

  const paymentSections = mergeClinicalPaymentSections(
    base as Record<string, unknown>,
    draft as Record<string, unknown>,
  )
  const budgetSections = preferGeneralBudgetSections(
    base as Record<string, unknown>,
    draft as Record<string, unknown>,
  )

  const draftRecord = draft as T & {
    anamnesis?: unknown
    stomatologicalExam?: unknown
    specializedAnnexes?: unknown
    treatmentPlan?: unknown
    informedConsent?: unknown
    treatmentPlanAuthorization?: unknown
    orthodonticsBudget?: unknown
    dentalImplantsBudget?: unknown
  }
  const baseRecord = base as T & {
    anamnesis?: unknown
    stomatologicalExam?: unknown
    specializedAnnexes?: unknown
    treatmentPlan?: unknown
    informedConsent?: unknown
    treatmentPlanAuthorization?: unknown
    orthodonticsBudget?: unknown
    dentalImplantsBudget?: unknown
  }

  return {
    ...base,
    ...draft,
    ...paymentSections,
    ...budgetSections,
    anamnesis: anamnesisHasContent(draftRecord.anamnesis)
      ? draftRecord.anamnesis
      : (baseRecord.anamnesis ?? draftRecord.anamnesis),
    stomatologicalExam: stomatologicalExamHasContent(draftRecord.stomatologicalExam)
      ? draftRecord.stomatologicalExam
      : (baseRecord.stomatologicalExam ?? draftRecord.stomatologicalExam),
    specializedAnnexes: specializedAnnexesHaveContent(draftRecord.specializedAnnexes)
      ? draftRecord.specializedAnnexes
      : (baseRecord.specializedAnnexes ?? draftRecord.specializedAnnexes),
    diagnoses: hasDiagnoses(draft) ? draft.diagnoses : base.diagnoses,
    diagnosticChart: hasChartEntries(draft) ? draft.diagnosticChart : base.diagnosticChart,
    findings: draft.findings?.trim() ? draft.findings : base.findings || draft.findings,
    treatmentPlan: treatmentPlanHasContent(draftRecord.treatmentPlan)
      ? draftRecord.treatmentPlan
      : (baseRecord.treatmentPlan ?? draftRecord.treatmentPlan),
    orthodonticsBudget: draftRecord.orthodonticsBudget ?? baseRecord.orthodonticsBudget,
    dentalImplantsBudget: draftRecord.dentalImplantsBudget ?? baseRecord.dentalImplantsBudget,
    treatmentPlanAuthorization:
      draftRecord.treatmentPlanAuthorization ?? baseRecord.treatmentPlanAuthorization,
    evolutionNotes: ensureEvolutionNoteIds(
      mergeSignedEvolutionNotes(notesOf(base), notesOf(draft)) as EvolutionNote[],
    ),
    informedConsent: keepStoredConsentSignatures(
      baseRecord.informedConsent,
      informedConsentHasContent(draftRecord.informedConsent)
        ? draftRecord.informedConsent
        : (baseRecord.informedConsent ?? draftRecord.informedConsent),
    ),
  } as T
}

/** La sección 4 vive en el borrador clínico o en el de valoración. */
export function clinicalDraftHasSection4(
  draft:
    | (LivingChart & {
        clinicalDraft?: LivingChart | null
        valuationDraft?: LivingChart | null
      })
    | null
    | undefined,
): boolean {
  if (!draft) return false
  return (
    livingChartHasContent(draft) ||
    livingChartHasContent(draft.clinicalDraft) ||
    livingChartHasContent(draft.valuationDraft)
  )
}

/**
 * Al confirmar el id guardado no se reemplazan los dientes que el usuario
 * sigue editando. Si el guardado conservó otra ficha con marcas, esa ficha vuelve.
 */
export function odontogramAfterPersist(
  previous: OdontogramData | null | undefined,
  persisted: OdontogramData,
): OdontogramData {
  if (!previous) return persisted
  if (
    odontogramHasMarks(persisted) &&
    !odontogramHasMarks(previous) &&
    String(previous.id ?? '') !== String(persisted.id ?? '')
  ) {
    return persisted
  }
  return {
    ...previous,
    id: persisted.id,
    patientId: persisted.patientId,
  }
}
