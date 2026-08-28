import type { Dispatch, SetStateAction } from 'react'
import type { ClinicalRecordFormData } from '@/types/clinicalRecord'
import type { OdontogramData } from '@/types/odontogram'

export interface ClinicalVoiceHandlers {
  getOdontogram: () => OdontogramData | null
  setOdontogram: (data: OdontogramData) => void
  getClinicalData: () => ClinicalRecordFormData | null
  setClinicalData: Dispatch<SetStateAction<ClinicalRecordFormData | null>>
  isDisabled?: () => boolean
}

let activeHandlers: ClinicalVoiceHandlers | null = null

export function registerClinicalVoiceHandlers(handlers: ClinicalVoiceHandlers): void {
  activeHandlers = handlers
}

export function unregisterClinicalVoiceHandlers(): void {
  activeHandlers = null
}

export function getClinicalVoiceHandlers(): ClinicalVoiceHandlers | null {
  return activeHandlers
}
