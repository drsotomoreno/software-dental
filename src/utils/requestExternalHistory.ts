import { IHCE_NAVIGATE_EVENT, IHCE_REQUEST_EVENT } from '@/types/ihce'
import { toPatientForeignKey } from '@/utils/patientId'

export const IHCE_EXTERNAL_HISTORY_EVENT = IHCE_REQUEST_EVENT

type ExternalHistoryHandler = (patientId: string) => void

let openHandler: ExternalHistoryHandler | null = null
let pendingPatientId: string | null = null

export function registerExternalHistoryHandler(handler: ExternalHistoryHandler): void {
  openHandler = handler
  if (pendingPatientId) {
    handler(pendingPatientId)
  }
}

export function unregisterExternalHistoryHandler(handler?: ExternalHistoryHandler): void {
  if (handler && openHandler !== handler) return
  openHandler = null
}

export function consumePendingExternalHistoryRequest(currentPatientId: string | number): boolean {
  if (!pendingPatientId) return false
  if (idsMatch(pendingPatientId, currentPatientId)) {
    pendingPatientId = null
    return true
  }
  return false
}

function idsMatch(requestedId: string, currentId: string | number | undefined | null): boolean {
  if (currentId === undefined || currentId === null || currentId === '') return false
  return requestedId === String(currentId) || requestedId === toPatientForeignKey(currentId)
}

export function shouldOpenForPatient(
  requestedId: string,
  currentRouteId: string | undefined,
  currentPatientId?: string | number,
): boolean {
  return idsMatch(requestedId, currentRouteId) || idsMatch(requestedId, currentPatientId)
}

export function navigateToPatientForIhce(patientId: string): void {
  pendingPatientId = patientId
  window.dispatchEvent(new CustomEvent(IHCE_NAVIGATE_EVENT, { detail: { patientId } }))
}

/**
 * Trigger listo para dictado y comandos de voz.
 * Abre el flujo de consentimiento delegado (OTP) del RDA en la ficha del paciente.
 */
export async function requestExternalHistory(patientId: string | number): Promise<void> {
  const id = toPatientForeignKey(patientId)
  pendingPatientId = id
  window.dispatchEvent(new CustomEvent(IHCE_REQUEST_EVENT, { detail: { patientId: id } }))

  if (openHandler) {
    openHandler(id)
    return
  }

  navigateToPatientForIhce(id)
}
