import { ClinicalPrecautionAlertBanner } from '@/components/clinical/ClinicalPrecautionAlertBanner'
import { usePatientPrecautionAlert } from '@/hooks/usePatientPrecautionAlert'

interface AgendaPatientAlertProps {
  patientRouteId?: string | null
  compact?: boolean
  className?: string
}

/** Único punto de la agenda que renderiza la alerta clínica de precaución. */
export function AgendaPatientAlert({
  patientRouteId,
  compact = false,
  className,
}: AgendaPatientAlertProps) {
  const alert = usePatientPrecautionAlert(patientRouteId)
  if (!alert?.active) return null
  return <ClinicalPrecautionAlertBanner alert={alert} compact={compact} className={className} />
}
