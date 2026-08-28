import { useEffect, useRef, type Dispatch, type SetStateAction } from 'react'
import {
  registerClinicalVoiceHandlers,
  unregisterClinicalVoiceHandlers,
} from '@/bootstrap/voiceClinicalRegistry'
import type { ClinicalRecordFormData } from '@/types/clinicalRecord'
import type { OdontogramData } from '@/types/odontogram'

export function useClinicalVoiceRegistry(
  odontogram: OdontogramData | null,
  setOdontogram: (data: OdontogramData) => void,
  clinicalData: ClinicalRecordFormData | null,
  setClinicalData: Dispatch<SetStateAction<ClinicalRecordFormData | null>>,
  disabled: boolean,
): void {
  const odontogramRef = useRef(odontogram)
  const clinicalRef = useRef(clinicalData)
  const disabledRef = useRef(disabled)

  odontogramRef.current = odontogram
  clinicalRef.current = clinicalData
  disabledRef.current = disabled

  useEffect(() => {
    registerClinicalVoiceHandlers({
      getOdontogram: () => odontogramRef.current,
      setOdontogram,
      getClinicalData: () => clinicalRef.current,
      setClinicalData,
      isDisabled: () => disabledRef.current,
    })
    return () => unregisterClinicalVoiceHandlers()
  }, [setOdontogram, setClinicalData])
}
