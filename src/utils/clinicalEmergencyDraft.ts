import type { ClinicalRecordFormData } from '@/types/clinicalRecord'
import type { OdontogramData } from '@/types/odontogram'
import type { PatientClinicalDraft } from '@/types/patientClinicalDraft'

const PREFIX = 'mhd_emergency_draft_'

export interface EmergencyClinicalDraftPayload {
  patientId: string
  patientSyncId?: string
  clinicalRevision: number
  contentHash: string
  timestamp: string
  clinicalData: ClinicalRecordFormData
  odontogram?: OdontogramData | null
  valuationOnly?: boolean
}

export function emergencyDraftStorageKey(canonicalPatientId: string): string {
  return `${PREFIX}${String(canonicalPatientId || '').trim()}`
}

export function writeEmergencyClinicalDraft(payload: EmergencyClinicalDraftPayload): boolean {
  if (typeof localStorage === 'undefined') return false
  const id = String(payload.patientId || payload.patientSyncId || '').trim()
  if (!id || !payload.clinicalData) return false
  try {
    localStorage.setItem(emergencyDraftStorageKey(id), JSON.stringify(payload))
    if (payload.patientSyncId && payload.patientSyncId !== id) {
      localStorage.setItem(emergencyDraftStorageKey(payload.patientSyncId), JSON.stringify(payload))
    }
    return true
  } catch {
    return false
  }
}

export function readEmergencyClinicalDraft(
  canonicalPatientId: string,
): EmergencyClinicalDraftPayload | null {
  if (typeof localStorage === 'undefined') return null
  const raw = localStorage.getItem(emergencyDraftStorageKey(canonicalPatientId))
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as EmergencyClinicalDraftPayload
    if (!parsed?.clinicalData || !parsed.timestamp) return null
    return parsed
  } catch {
    return null
  }
}

export function clearEmergencyClinicalDraft(canonicalPatientId: string, aliasIds: string[] = []): void {
  if (typeof localStorage === 'undefined') return
  const keys = new Set(
    [canonicalPatientId, ...aliasIds].map((id) => String(id || '').trim()).filter(Boolean),
  )
  for (const id of keys) {
    try {
      localStorage.removeItem(emergencyDraftStorageKey(id))
    } catch {
      // ignore
    }
  }
}

export function emergencyDraftIsNewerThanDexie(
  emergency: EmergencyClinicalDraftPayload,
  dexie: PatientClinicalDraft | null | undefined,
): boolean {
  if (!dexie) return true
  const emergencyRev = Number(emergency.clinicalRevision) || 0
  const localRev = Number(dexie.clinicalRevision) || 0
  if (emergencyRev !== localRev) return emergencyRev > localRev
  const emergencyStamp = Date.parse(emergency.timestamp) || 0
  const localStamp =
    Date.parse(dexie.clinicalUpdatedAt || '') || Date.parse(dexie.updatedAt || '') || 0
  return emergencyStamp > localStamp
}
