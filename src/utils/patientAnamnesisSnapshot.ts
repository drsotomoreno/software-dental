import { db } from '@/db/database'
import type { Anamnesis } from '@/types/anamnesis'
import { normalizeAnamnesis } from '@/types/anamnesis'
import type { VitalSignsExam } from '@/types/stomatologicalExam'
import { normalizeVitalSignsExam } from '@/types/stomatologicalExam'
import { getPatientClinicalDraft } from '@/utils/patientClinicalDraft'
import { toPatientForeignKey } from '@/utils/patientId'

async function getLatestClinicalRecordForPatient(patientRouteId: string) {
  const patientId = toPatientForeignKey(patientRouteId)
  const records = await db.clinicalRecords.where('patientId').equals(patientId).toArray()
  if (records.length === 0) return null

  return records.sort((a, b) => {
    const aTime = a.signedAt ?? a.updatedAt ?? a.createdAt ?? ''
    const bTime = b.signedAt ?? b.updatedAt ?? b.createdAt ?? ''
    return bTime.localeCompare(aTime)
  })[0]
}

export async function getLatestAnamnesisForPatient(
  patientRouteId: string,
): Promise<Anamnesis | null> {
  try {
    const draft = await getPatientClinicalDraft(patientRouteId)
    if (draft?.valuationDraft?.anamnesis) {
      return normalizeAnamnesis(draft.valuationDraft.anamnesis)
    }
  } catch {
    // Borrador opcional.
  }

  const latest = await getLatestClinicalRecordForPatient(patientRouteId)
  return latest?.anamnesis ? normalizeAnamnesis(latest.anamnesis) : null
}

export async function getLatestVitalSignsForPatient(
  patientRouteId: string,
): Promise<VitalSignsExam | null> {
  try {
    const draft = await getPatientClinicalDraft(patientRouteId)
    if (draft?.valuationDraft?.stomatologicalExam?.vitalSigns) {
      return normalizeVitalSignsExam(draft.valuationDraft.stomatologicalExam.vitalSigns)
    }
  } catch {
    // Borrador opcional.
  }

  const latest = await getLatestClinicalRecordForPatient(patientRouteId)
  return latest?.stomatologicalExam?.vitalSigns
    ? normalizeVitalSignsExam(latest.stomatologicalExam.vitalSigns)
    : null
}
