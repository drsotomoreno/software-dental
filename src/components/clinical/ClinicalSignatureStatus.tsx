import { useLiveQuery } from 'dexie-react-hooks'
import { getLatestSignedClinicalRecord } from '@/utils/clinicalRecordSnapshot'

interface ClinicalSignatureStatusProps {
  patientId: string
}

/**
 * Estado de la firma de la historia clínica (registro clínico bloqueado).
 * No indica si las notas de evolución están firmadas: cada evolución se firma aparte.
 */
export function ClinicalSignatureStatus({ patientId }: ClinicalSignatureStatusProps) {
  const signedRecord = useLiveQuery(
    () => (patientId ? getLatestSignedClinicalRecord(patientId) : null),
    [patientId],
  )

  if (signedRecord === undefined) return null

  const firmada = signedRecord != null
  const label = firmada ? 'Historia clínica firmada' : 'Historia clínica pendiente de firmar'

  return (
    <span
      role="status"
      title={
        firmada
          ? 'La historia clínica está firmada. Cada evolución se firma por separado.'
          : 'La historia clínica está pendiente de firmar. Cada evolución se firma por separado.'
      }
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold ${
        firmada ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-900'
      }`}
    >
      <span className="h-2 w-2 rounded-full bg-current" aria-hidden />
      {label}
    </span>
  )
}
