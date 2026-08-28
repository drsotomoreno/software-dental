import {
  REHAB_CARBAMIDE_PEROXIDE_OPTIONS,
  REHAB_DENTAL_WHITENING_OPTIONS,
  REHAB_HYDROGEN_PEROXIDE_OPTIONS,
  REHAB_NON_VITAL_WHITENING_OPTIONS,
  type RehabCarbamidePeroxideConcentration,
  type RehabDentalWhiteningPlan,
  type RehabDentalWhiteningType,
  type RehabHydrogenPeroxideConcentration,
  type RehabNonVitalWhiteningTechnique,
} from '@/constants/dentalWhitening'

interface DentalWhiteningSectionProps {
  value: RehabDentalWhiteningPlan
  onChange: (value: RehabDentalWhiteningPlan) => void
  disabled?: boolean
}

export function DentalWhiteningSection({
  value,
  onChange,
  disabled = false,
}: DentalWhiteningSectionProps) {
  const toggleOption = (id: RehabDentalWhiteningType) => {
    if (disabled) return

    const nextActive = !value[id]
    if (id === 'casero') {
      onChange({
        ...value,
        casero: nextActive,
        caseroPeroxidoCarbamida: nextActive ? value.caseroPeroxidoCarbamida : '',
      })
      return
    }

    if (id === 'consultorio') {
      onChange({
        ...value,
        consultorio: nextActive,
        consultorioPeroxidoHidrogeno: nextActive ? value.consultorioPeroxidoHidrogeno : '',
      })
      return
    }

    if (id === 'diente_oscurecido') {
      onChange({
        ...value,
        diente_oscurecido: nextActive,
        dienteOscurecidoTecnica: nextActive ? value.dienteOscurecidoTecnica : '',
      })
      return
    }

    onChange({ ...value, [id]: nextActive })
  }

  const selectCarbamidePeroxide = (concentration: RehabCarbamidePeroxideConcentration) => {
    if (disabled || !value.casero) return
    onChange({
      ...value,
      caseroPeroxidoCarbamida:
        value.caseroPeroxidoCarbamida === concentration ? '' : concentration,
    })
  }

  const selectHydrogenPeroxide = (concentration: RehabHydrogenPeroxideConcentration) => {
    if (disabled || !value.consultorio) return
    onChange({
      ...value,
      consultorioPeroxidoHidrogeno:
        value.consultorioPeroxidoHidrogeno === concentration ? '' : concentration,
    })
  }

  const selectNonVitalTechnique = (technique: RehabNonVitalWhiteningTechnique) => {
    if (disabled || !value.diente_oscurecido) return
    onChange({
      ...value,
      dienteOscurecidoTecnica: value.dienteOscurecidoTecnica === technique ? '' : technique,
    })
  }

  return (
    <section className="space-y-3 rounded-xl border border-sky-200 bg-gradient-to-b from-sky-50/60 to-white p-4">
      <div>
        <h5 className="text-sm font-semibold text-slate-800">Blanqueamiento dental</h5>
        <p className="text-xs text-slate-500">
          Seleccione el tipo de blanqueamiento indicado para el plan de aclaramiento.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {REHAB_DENTAL_WHITENING_OPTIONS.map((option) => {
          const isActive = value[option.id]

          return (
            <button
              key={option.id}
              type="button"
              disabled={disabled}
              onClick={() => toggleOption(option.id)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-medium transition disabled:cursor-not-allowed disabled:opacity-45 ${
                isActive
                  ? 'border-slate-300 bg-white text-slate-800 shadow-sm ring-2 ring-offset-1'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
              }`}
              style={isActive ? { boxShadow: `0 0 0 2px ${option.color}55` } : undefined}
              aria-pressed={isActive}
            >
              <span
                className="h-2.5 w-2.5 rounded-full border border-white shadow-sm"
                style={{ backgroundColor: option.color }}
              />
              {option.label}
            </button>
          )
        })}
      </div>

      {value.casero && (
        <div className="flex flex-wrap gap-2 border-t border-sky-100 pt-3">
          {REHAB_CARBAMIDE_PEROXIDE_OPTIONS.map((option) => {
            const isActive = value.caseroPeroxidoCarbamida === option.id

            return (
              <button
                key={option.id}
                type="button"
                disabled={disabled}
                onClick={() => selectCarbamidePeroxide(option.id)}
                className={`inline-flex items-center rounded-full border px-3 py-1.5 text-[11px] font-medium transition disabled:cursor-not-allowed disabled:opacity-45 ${
                  isActive
                    ? 'border-sky-300 bg-sky-50 text-sky-900 shadow-sm ring-2 ring-sky-200 ring-offset-1'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                }`}
                aria-pressed={isActive}
              >
                {option.label}
              </button>
            )
          })}
        </div>
      )}

      {value.consultorio && (
        <div className="flex flex-wrap gap-2 border-t border-sky-100 pt-3">
          {REHAB_HYDROGEN_PEROXIDE_OPTIONS.map((option) => {
            const isActive = value.consultorioPeroxidoHidrogeno === option.id

            return (
              <button
                key={option.id}
                type="button"
                disabled={disabled}
                onClick={() => selectHydrogenPeroxide(option.id)}
                className={`inline-flex items-center rounded-full border px-3 py-1.5 text-[11px] font-medium transition disabled:cursor-not-allowed disabled:opacity-45 ${
                  isActive
                    ? 'border-emerald-300 bg-emerald-50 text-emerald-900 shadow-sm ring-2 ring-emerald-200 ring-offset-1'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                }`}
                aria-pressed={isActive}
              >
                {option.label}
              </button>
            )
          })}
        </div>
      )}

      {value.diente_oscurecido && (
        <div className="flex flex-wrap gap-2 border-t border-sky-100 pt-3">
          {REHAB_NON_VITAL_WHITENING_OPTIONS.map((option) => {
            const isActive = value.dienteOscurecidoTecnica === option.id

            return (
              <button
                key={option.id}
                type="button"
                disabled={disabled}
                onClick={() => selectNonVitalTechnique(option.id)}
                className={`inline-flex items-center rounded-full border px-3 py-1.5 text-[11px] font-medium transition disabled:cursor-not-allowed disabled:opacity-45 ${
                  isActive
                    ? 'border-amber-300 bg-amber-50 text-amber-900 shadow-sm ring-2 ring-amber-200 ring-offset-1'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                }`}
                aria-pressed={isActive}
              >
                {option.label}
              </button>
            )
          })}
        </div>
      )}
    </section>
  )
}
