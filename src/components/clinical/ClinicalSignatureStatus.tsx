import { useLiveQuery } from 'dexie-react-hooks'
import { getLatestSignedClinicalRecord } from '@/utils/clinicalRecordSnapshot'

interface ClinicalSignatureStatusProps {
  patientId: string
}

/** Indica solo si la historia del paciente ya tiene una atención firmada. */
export function ClinicalSignatureStatus({ patientId }: ClinicalSignatureStatusProps) {
  const signedRecord = useLiveQuery(
    () => getLatestSignedClinicalRecord(patientId),
    [patientId],
  )

  if (signedRecord === undefined) return null

  const firmada = signedRecord != null

  return (
    <span
      role="status"
      className={
        firmada
          ? 'rounded-full bg-green-100 px-3 py-1 text-sm font-medium text-green-800'
          : 'rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-600'
      }
    >
      {firmada ? 'Historia firmada' : 'Historia sin firmar'}
    </span>
  )
}
