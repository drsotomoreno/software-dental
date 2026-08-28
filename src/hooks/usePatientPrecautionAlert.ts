import { useLiveQuery } from 'dexie-react-hooks'
import {
  getClinicalPrecautionAlert,
  type ClinicalPrecautionAlert,
} from '@/utils/clinicalPrecautionAlerts'
import { getLatestAnamnesisForPatient, getLatestVitalSignsForPatient } from '@/utils/patientAnamnesisSnapshot'

const inactiveAlert: ClinicalPrecautionAlert = {
  active: false,
  reasons: [],
  summary: '',
}

export function usePatientPrecautionAlert(patientRouteId?: string | null) {
  return useLiveQuery(async () => {
    if (!patientRouteId) return inactiveAlert
    const [anamnesis, vitalSigns] = await Promise.all([
      getLatestAnamnesisForPatient(patientRouteId),
      getLatestVitalSignsForPatient(patientRouteId),
    ])
    if (!anamnesis && !vitalSigns) return inactiveAlert
    return getClinicalPrecautionAlert(anamnesis ?? undefined, vitalSigns)
  }, [patientRouteId])
}
