import { db } from '@/db/database'
import type {
  ClinicalRecord,
  ClinicalRecordFormData,
  TreatingDentistSignature,
  TreatmentPlanItem,
} from '@/types/clinicalRecord'
import { normalizePaymentControlLines } from '@/utils/paymentControlLines'
import { normalizeAnamnesis } from '@/types/anamnesis'
import { normalizeConsent } from '@/types/consent'
import { normalizeSpecializedAnnexes } from '@/types/specializedAnnexes'
import {
  createEmptyStomatologicalExam,
  normalizeStomatologicalExam,
} from '@/types/stomatologicalExam'
import { normalizeClinicalDiagnosticChart } from '@/types/clinicalDiagnosticChart'
import { migrateLegacyBudget, generateId } from '@/utils'
import { sortEvolutionNotesChronologically } from '@/utils/recordIntegrity'
import { toDexiePrimaryKey, toPatientForeignKey } from '@/utils/patientId'
import { normalizeClinicalRecordPayments } from '@/services/paymentInvoiceService'

function normalizeTreatmentPlanItems(
  items: TreatmentPlanItem[] | undefined,
): TreatmentPlanItem[] {
  if (!Array.isArray(items)) return []

  return items.map((item) => ({
    id: item?.id ?? generateId(),
    phase: item?.phase ?? 'fase_i',
    procedure: item?.procedure ?? '',
    cupsCode: item?.cupsCode,
    toothNumber: item?.toothNumber,
    fdiQuadrant: item?.fdiQuadrant,
    arch: item?.arch,
    anatomicalZone: item?.anatomicalZone,
    quantity: item?.quantity ?? 1,
    unitPrice: item?.unitPrice ?? 0,
    notes: item?.notes,
    patientApproved: item?.patientApproved ?? 'pendiente',
    executionStatus: item?.executionStatus ?? 'pendiente',
    sessionDate: item?.sessionDate,
    source: item?.source,
    diagnosisCode: item?.diagnosisCode,
    diagnosisDescription: item?.diagnosisDescription,
  }))
}

export function normalizeClinicalRecordForExport(record: ClinicalRecord): ClinicalRecord {
  const migrated = migrateLegacyBudget(
    record.treatmentPlan ?? [],
    record.budgetItems,
    record.budget ?? { subtotal: 0, discount: 0, total: 0, currency: 'COP' },
    record.orthodonticsBudget,
    record.dentalImplantsBudget,
  )

  return normalizeClinicalRecordPayments({
    ...record,
    anamnesis: normalizeAnamnesis(record.anamnesis),
    stomatologicalExam: record.stomatologicalExam
      ? normalizeStomatologicalExam(record.stomatologicalExam)
      : createEmptyStomatologicalExam(),
    specializedAnnexes: normalizeSpecializedAnnexes(record.specializedAnnexes),
    diagnosticChart: normalizeClinicalDiagnosticChart(record.diagnosticChart),
    diagnoses: Array.isArray(record.diagnoses) ? record.diagnoses : [],
    diagnosisNotes: record.diagnosisNotes ?? '',
    findings: record.findings ?? '',
    treatmentPlan: normalizeTreatmentPlanItems(record.treatmentPlan),
    treatmentPlanNotes: record.treatmentPlanNotes ?? '',
    budgetItems: migrated.budgetItems ?? [],
    orthodonticsBudget: migrated.orthodonticsBudget,
    dentalImplantsBudget: migrated.dentalImplantsBudget,
    budget: migrated.budget ?? { subtotal: 0, discount: 0, total: 0, currency: 'COP' },
    paymentPlan: Array.isArray(record.paymentPlan) ? record.paymentPlan : [],
    paymentControl: Array.isArray(record.paymentControl) ? record.paymentControl : [],
    paymentControlLines: normalizePaymentControlLines(record.paymentControlLines),
    orthodonticsPaymentControl: Array.isArray(record.orthodonticsPaymentControl)
      ? record.orthodonticsPaymentControl
      : [],
    evolutionNotes: sortEvolutionNotesChronologically(
      Array.isArray(record.evolutionNotes) ? record.evolutionNotes : [],
    ),
    informedConsent: normalizeConsent(record.informedConsent),
  })
}

export function clinicalRecordToFormData(
  record: ClinicalRecord,
  professionalLicense: string,
): ClinicalRecordFormData {
  const migrated = migrateLegacyBudget(
    record.treatmentPlan ?? [],
    record.budgetItems,
    record.budget ?? { subtotal: 0, discount: 0, total: 0, currency: 'COP' },
    record.orthodonticsBudget,
    record.dentalImplantsBudget,
  )

  return normalizeClinicalRecordPayments({
    anamnesis: normalizeAnamnesis(record.anamnesis),
    stomatologicalExam: record.stomatologicalExam
      ? normalizeStomatologicalExam(record.stomatologicalExam)
      : createEmptyStomatologicalExam(),
    specializedAnnexes: normalizeSpecializedAnnexes(record.specializedAnnexes),
    diagnosticChart: normalizeClinicalDiagnosticChart(record.diagnosticChart),
    diagnoses: Array.isArray(record.diagnoses) ? record.diagnoses : [],
    diagnosisNotes: record.diagnosisNotes ?? '',
    findings: record.findings ?? '',
    treatmentPlan: normalizeTreatmentPlanItems(record.treatmentPlan),
    treatmentPlanNotes: record.treatmentPlanNotes ?? '',
    budgetItems: migrated.budgetItems ?? [],
    orthodonticsBudget: migrated.orthodonticsBudget,
    dentalImplantsBudget: migrated.dentalImplantsBudget,
    budget: migrated.budget ?? { subtotal: 0, discount: 0, total: 0, currency: 'COP' },
    paymentPlan: Array.isArray(record.paymentPlan) ? record.paymentPlan : [],
    paymentControl: Array.isArray(record.paymentControl) ? record.paymentControl : [],
    paymentControlLines: normalizePaymentControlLines(record.paymentControlLines),
    orthodonticsPaymentControl: Array.isArray(record.orthodonticsPaymentControl)
      ? record.orthodonticsPaymentControl
      : [],
    evolutionNotes: sortEvolutionNotesChronologically(
      Array.isArray(record.evolutionNotes) ? record.evolutionNotes : [],
    ),
    informedConsent: normalizeConsent(
      record.informedConsent,
      professionalLicense,
      professionalLicense,
    ),
    valuationConsent: record.valuationConsent ?? null,
  })
}

export async function listPatientClinicalRecords(
  patientRouteId: string,
): Promise<ClinicalRecord[]> {
  const patientId = toPatientForeignKey(patientRouteId)
  const numericKey = toDexiePrimaryKey(patientRouteId)

  const byString = await db.clinicalRecords.where('patientId').equals(patientId).toArray()

  let byNumeric: ClinicalRecord[] = []
  if (typeof numericKey === 'number') {
    byNumeric = await db.clinicalRecords.where('patientId').equals(numericKey).toArray()
  }

  return [...new Map([...byString, ...byNumeric].map((record) => [record.id, record])).values()]
}

function latestClinicalRecord(records: ClinicalRecord[]): ClinicalRecord | null {
  if (records.length === 0) return null
  return [...records].sort((a, b) =>
    (b.signedAt ?? b.updatedAt ?? b.createdAt ?? '').localeCompare(
      a.signedAt ?? a.updatedAt ?? a.createdAt ?? '',
    ),
  )[0]
}

export async function getLatestClinicalRecord(
  patientRouteId: string,
): Promise<ClinicalRecord | null> {
  return latestClinicalRecord(await listPatientClinicalRecords(patientRouteId))
}

export async function getLatestSignedClinicalRecord(
  patientRouteId: string,
): Promise<ClinicalRecord | null> {
  const records = await listPatientClinicalRecords(patientRouteId)
  return latestClinicalRecord(records.filter((record) => record.isLocked))
}

export interface MainHistorySignatureStatus {
  signed: boolean
  signedAt?: string
  signature: TreatingDentistSignature | null
}

export function treatingDentistSignatureOf(
  record: ClinicalRecord,
): TreatingDentistSignature | null {
  const signature = record.treatingDentistSignature
  if (!signature?.signedAt || !signature.signatureDataUrl) return null
  return signature
}

/** Firma de la historia principal. Los snapshots RIPS antiguos cuentan como firmados. */
export async function getMainHistorySignatureStatus(
  patientRouteId: string,
): Promise<MainHistorySignatureStatus> {
  if (!patientRouteId) return { signed: false, signature: null }

  const records = await listPatientClinicalRecords(patientRouteId)
  const signatures = records
    .map((record) => treatingDentistSignatureOf(record))
    .filter((signature): signature is TreatingDentistSignature => signature != null)
    .sort((a, b) => b.signedAt.localeCompare(a.signedAt))

  if (signatures[0]) {
    return {
      signed: true,
      signedAt: signatures[0].signedAt,
      signature: signatures[0],
    }
  }

  const legacy = latestClinicalRecord(
    records.filter((record) => record.isLocked && Boolean(record.signedAt?.trim())),
  )
  if (legacy?.signedAt) {
    return { signed: true, signedAt: legacy.signedAt, signature: null }
  }

  const flagged = latestClinicalRecord(
    records.filter((record) => record.isSigned === true && Boolean(record.signedAt?.trim())),
  )
  if (flagged?.signedAt) {
    return {
      signed: true,
      signedAt: flagged.signedAt,
      signature: treatingDentistSignatureOf(flagged),
    }
  }

  return { signed: false, signature: null }
}
