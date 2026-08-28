import type { ClinicalPrecautionAlert } from '@/utils/clinicalPrecautionAlerts'

interface ClinicalPrecautionAlertBannerProps {
  alert: ClinicalPrecautionAlert
  compact?: boolean
  className?: string
}

export function ClinicalPrecautionAlertBanner({
  alert,
  compact = false,
  className = '',
}: ClinicalPrecautionAlertBannerProps) {
  if (!alert.active) return null

  return (
    <div
      role="alert"
      className={`rounded-lg border-2 border-red-600 bg-red-600 px-3 py-2 text-red-50 shadow-sm ${className}`}
    >
      <p className="text-sm font-semibold">
        ⚠ Precaución clínica — revise antecedentes antes del procedimiento
      </p>
      {!compact && (
        <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-relaxed text-red-50/95">
          {alert.reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      )}
      {compact && alert.reasons.length > 0 && (
        <p className="mt-1 text-xs text-red-50/95">{alert.reasons.slice(0, 2).join(' · ')}</p>
      )}
    </div>
  )
}
