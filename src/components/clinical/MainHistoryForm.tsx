import type { ReactNode } from 'react'
import type { ClinicalRecordFormData } from '@/types/clinicalRecord'
import type { PatientPhase } from '@/types/patient'
import type { OdontogramData } from '@/types/odontogram'
import type { UserProfile } from '@/types/user'
import { ClinicalHistoryForm } from './ClinicalHistoryForm'
import { RapidValuationForm } from './RapidValuationForm'

interface MainHistoryFormProps {
  patientPhase: PatientPhase
  initialData?: Partial<ClinicalRecordFormData>
  odontogram?: OdontogramData | null
  onChange: (data: ClinicalRecordFormData) => void
  onAcceptTreatment: () => void
  acceptingTreatment?: boolean
  disabled?: boolean
  professionalName?: string
  professionalLicense?: string
  authorUserId?: string
  authorEmail?: string
  activeSection?: string
  exportSection?: ReactNode
  onOdontogramChange?: (data: OdontogramData) => void
  patientId?: string
  encounterId?: string
  clinicalUser?: UserProfile | null
}

export function MainHistoryForm({
  patientPhase,
  onAcceptTreatment,
  acceptingTreatment = false,
  activeSection = 'all',
  ...clinicalProps
}: MainHistoryFormProps) {
  switch (patientPhase) {
    case 'VALORACION_RAPIDA':
      if (activeSection !== 'all' && activeSection !== 'valoracion') {
        return null
      }
      return (
        <RapidValuationForm
          initialData={clinicalProps.initialData}
          odontogram={clinicalProps.odontogram}
          onChange={clinicalProps.onChange}
          onAcceptTreatment={onAcceptTreatment}
          acceptingTreatment={acceptingTreatment}
          disabled={clinicalProps.disabled}
        />
      )

    case 'TRATAMIENTO_ACEPTADO':
      return (
        <ClinicalHistoryForm
          {...clinicalProps}
          activeSection={activeSection}
        />
      )

    default:
      return null
  }
}
