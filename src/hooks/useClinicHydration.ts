import { useEffect, useState } from 'react'
import {
  getClinicalSyncHealth,
  isClinicInitialHydrating,
  subscribeClinicalSyncHealth,
  type ClinicalSyncHealth,
} from '@/services/clinicalSyncHealth'

/**
 * Estado de la primera hidratación clínica tras login/restore.
 * Útil para no renderizar listados sobre arrays aún undefined/null.
 */
export function useClinicHydration(): {
  health: ClinicalSyncHealth
  isHydrating: boolean
} {
  const [health, setHealth] = useState<ClinicalSyncHealth>(() => getClinicalSyncHealth())

  useEffect(() => subscribeClinicalSyncHealth(() => setHealth(getClinicalSyncHealth())), [])

  return {
    health,
    isHydrating: isClinicInitialHydrating(health),
  }
}
