import { Landmark } from 'lucide-react'
import {
  PERFIL_FISCAL_NO_OBLIGADO_NOTICE,
  PERFIL_FISCAL_OPTIONS,
  UVT_2026_EDUCATION_BANNER,
  isNoObligadoFev,
  normalizePerfilFiscal,
  type FiscalProfile,
} from '@/utils/fiscalProfile'
import { LegalTooltip } from '@/components/ui/LegalTooltip'

export interface FiscalProfileSelectorProps {
  value?: FiscalProfile | string | boolean | null
  onChange: (next: FiscalProfile) => void
  disabled?: boolean
  title?: string
  description?: string
}

/**
 * Selector de onboarding: perfil fiscal del odontólogo.
 * Si elige Profesional Independiente &lt; 3.500 UVT, aclara que los RIPS
 * se envían mensualmente sin factura.
 */
export function FiscalProfileSelector({
  value,
  onChange,
  disabled = false,
  title = 'Perfil fiscal',
  description = 'Indique si está obligado a factura electrónica de venta o si es profesional independiente por debajo del umbral de 3.500 UVT.',
}: FiscalProfileSelectorProps) {
  const current = normalizePerfilFiscal(value)
  const selected = PERFIL_FISCAL_OPTIONS.find((option) => option.id === current)
  const showMonthlyNotice = isNoObligadoFev(current)

  return (
    <fieldset className="space-y-4" disabled={disabled}>
      <legend className="sr-only">{title}</legend>
      <div className="flex items-start gap-3">
        <Landmark className="mt-0.5 h-5 w-5 shrink-0 text-dental-700" aria-hidden />
        <div>
          <p className="flex items-center gap-1.5 text-base font-semibold text-slate-900">
            {title}
            <LegalTooltip topic="uvt" />
            <LegalTooltip topic="fev" />
          </p>
          <p className="mt-1 text-sm text-slate-600">{description}</p>
          <p className="mt-2 text-xs leading-relaxed text-slate-500">{UVT_2026_EDUCATION_BANNER}</p>
        </div>
      </div>

      <div
        role="radiogroup"
        aria-label={title}
        className="grid gap-3 sm:grid-cols-2"
      >
        {PERFIL_FISCAL_OPTIONS.map((option) => {
          const active = current === option.id
          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={active}
              data-testid={`perfil-fiscal-${option.id}`}
              disabled={disabled}
              onClick={() => onChange(option.id)}
              className={`rounded-2xl border p-4 text-left transition ${
                active
                  ? 'border-dental-500 bg-dental-50 ring-2 ring-dental-200'
                  : 'border-slate-200 bg-white hover:border-dental-200'
              } ${disabled ? 'cursor-not-allowed opacity-80' : ''}`}
            >
              <p className="text-sm font-semibold text-slate-900">{option.label}</p>
              <p className="mt-1 text-xs leading-relaxed text-slate-600">{option.hint}</p>
            </button>
          )
        })}
      </div>

      {showMonthlyNotice && (
        <p
          role="status"
          aria-live="polite"
          data-testid="perfil-fiscal-uvt-notice"
          className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-950"
        >
          {selected?.notice ?? PERFIL_FISCAL_NO_OBLIGADO_NOTICE}
        </p>
      )}
    </fieldset>
  )
}
