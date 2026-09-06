import { useEffect } from 'react'
import {
  consumePendingExternalHistoryRequest,
  navigateToPatientForIhce,
  registerExternalHistoryHandler,
  shouldOpenForPatient,
  unregisterExternalHistoryHandler,
} from '@/utils/requestExternalHistory'

/**
 * Registra el handler de la ficha activa para `requestExternalHistory(patientId)`.
 */
export function useExternalHistoryRequest(
  routeId: string | undefined,
  patientId: string | number | undefined,
  onOpen: () => void,
  enabled = true,
): void {
  useEffect(() => {
    if (!enabled || !routeId) return

    const handler = (requestedId: string) => {
      if (shouldOpenForPatient(requestedId, routeId, patientId)) {
        consumePendingExternalHistoryRequest(routeId)
        if (patientId != null) consumePendingExternalHistoryRequest(patientId)
        onOpen()
        return
      }
      navigateToPatientForIhce(requestedId)
    }

    registerExternalHistoryHandler(handler)
    if (consumePendingExternalHistoryRequest(routeId)) {
      onOpen()
    } else if (patientId != null && consumePendingExternalHistoryRequest(patientId)) {
      onOpen()
    }

    return () => unregisterExternalHistoryHandler(handler)
  }, [routeId, patientId, onOpen, enabled])
}
