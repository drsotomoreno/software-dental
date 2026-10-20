import { useLiveQuery } from 'dexie-react-hooks'
import { formatDate } from '@/utils'
import { getMainHistorySignatureStatus } from '@/utils/clinicalRecordSnapshot'

interface ClinicalSignatureStatusProps {
  patientId: string
}

/**
 * Estado de la firma de la historia clínica principal (odontólogo tratante).
 * No indica si las notas de evolución o el consentimiento están firmados.
 */
export function ClinicalSignatureStatus({ patientId }: ClinicalSignatureStatusProps) {
  const status = useLiveQuery(
    () => (patientId ? getMainHistorySignatureStatus(patientId) : null),
    [patientId],
  )

  if (status === undefined || status === null) return null

  const firmada = status.signed
  const when = firmada && status.signedAt ? formatDate(status.signedAt) : ''
  const label = firmada ? (when ? `Firmada · ${when}` : 'Firmada') : 'Pendiente de firmar'

  return (
    <span
      role="status"
      title={
        firmada
          ? 'La historia clínica principal está firmada por el odontólogo tratante. Las evoluciones y el consentimiento se firman aparte.'
          : 'La historia clínica principal está pendiente de la firma del odontólogo tratante.'
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
