import type { CanonicalRipsValidationError } from '@/utils/canonicalEvolutionRips'

interface EvolutionRipsDiagnosticsPanelProps {
  title?: string
  errors: CanonicalRipsValidationError[]
  onRetry?: () => void
  retryLabel?: string
  disabled?: boolean
  isSubmitting?: boolean
  patientFixHref?: string
}

const SCOPE_LABEL: Record<NonNullable<CanonicalRipsValidationError['scope']>, string> = {
  patient: 'Ficha del paciente',
  clinical: 'Datos clínicos / CUPS-CIE10',
  billing: 'Facturación / vínculo RIPS',
  professional: 'Prestador / odontólogo',
}

export function EvolutionRipsDiagnosticsPanel({
  title = 'No se puede continuar con RIPS',
  errors,
  onRetry,
  retryLabel = 'Reintentar',
  disabled = false,
  isSubmitting = false,
  patientFixHref,
}: EvolutionRipsDiagnosticsPanelProps) {
  if (!errors.length) return null

  const patientErrors = errors.filter((error) => error.scope === 'patient')

  return (
    <div
      role="alert"
      className="mt-4 rounded-lg border border-red-300 bg-red-50 px-3 py-3 text-sm text-red-950"
    >
      <p className="font-semibold">{title}</p>
      <ul className="mt-2 space-y-2">
        {errors.map((error) => (
          <li key={`${error.code}-${error.field}`} className="rounded-md bg-white/70 px-2 py-1.5">
            <p className="font-medium">
              {error.scope ? `${SCOPE_LABEL[error.scope]} · ` : ''}
              <span className="font-mono text-xs">{error.field}</span>
            </p>
            <p className="mt-0.5">{error.message}</p>
            {error.fix && <p className="mt-0.5 text-xs text-red-800">Solución: {error.fix}</p>}
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap gap-2">
        {patientErrors.length > 0 && patientFixHref && (
          <a href={patientFixHref} className="btn-secondary border-red-300 text-xs text-red-900 hover:bg-red-100">
            Completar ficha del paciente
          </a>
        )}
        {onRetry && (
          <button
            type="button"
            className="btn-secondary border-red-300 text-xs text-red-900 hover:bg-red-100"
            disabled={disabled || isSubmitting}
            onClick={onRetry}
          >
            {isSubmitting ? 'Procesando…' : retryLabel}
          </button>
        )}
      </div>
    </div>
  )
}
