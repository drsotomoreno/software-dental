import { db } from '@/db/database'
import { getStoredApiAuth } from '@/services/apiAuthService'
import { getCurrentClinicId } from '@/services/clinicalSyncState'
import type { ClinicalAuditLogEntry, ClinicalAuditSource } from '@/types/patientClinicalDraft'
import { generateId } from '@/utils/crypto'
import { detectChangedClinicalSections } from '../../shared/clinicalFormHash.js'

export async function appendClinicalAuditLog(input: {
  patientSyncId: string
  clinicalRevision: number
  contentHash: string
  changedSections?: string[]
  previousForm?: unknown
  nextForm?: unknown
  source: ClinicalAuditSource
}): Promise<ClinicalAuditLogEntry | null> {
  const patientSyncId = String(input.patientSyncId || '').trim()
  if (!patientSyncId) return null

  const auth = getStoredApiAuth()
  const changedSections =
    input.changedSections ??
    detectChangedClinicalSections(input.previousForm, input.nextForm)

  const planOrBudgetTouched = changedSections.some((section) =>
    ['treatmentPlan', 'budgetItems', 'budget', 'orthodonticsBudget', 'dentalImplantsBudget'].includes(
      section,
    ),
  )
  const prevForm =
    input.previousForm && typeof input.previousForm === 'object'
      ? (input.previousForm as Record<string, unknown>)
      : null
  const nextForm =
    input.nextForm && typeof input.nextForm === 'object'
      ? (input.nextForm as Record<string, unknown>)
      : null

  const entry: ClinicalAuditLogEntry = {
    id: generateId(),
    patientSyncId,
    clinicaId: getCurrentClinicId() || String(auth?.user?.clinicId || ''),
    userId: String(auth?.user?.id || ''),
    userEmail: String(auth?.user?.email || ''),
    clinicalRevision: Math.max(0, Number(input.clinicalRevision) || 0),
    contentHash: String(input.contentHash || ''),
    changedSections,
    source: input.source,
    createdAt: new Date().toISOString(),
    ...(planOrBudgetTouched
      ? {
          beforeSnapshot: prevForm
            ? {
                treatmentPlan: prevForm.treatmentPlan,
                budgetItems: prevForm.budgetItems,
                budget: prevForm.budget,
              }
            : null,
          afterSnapshot: nextForm
            ? {
                treatmentPlan: nextForm.treatmentPlan,
                budgetItems: nextForm.budgetItems,
                budget: nextForm.budget,
              }
            : null,
        }
      : {}),
  }

  try {
    await db.clinicalAuditLogs.add(entry)
  } catch (error) {
    console.warn('[ClinicalAudit] No se pudo escribir bitácora local', error)
  }

  return entry
}

export async function listPendingClinicalAuditLogs(limit = 200): Promise<ClinicalAuditLogEntry[]> {
  try {
    return await db.clinicalAuditLogs.orderBy('createdAt').reverse().limit(limit).toArray()
  } catch {
    return []
  }
}
