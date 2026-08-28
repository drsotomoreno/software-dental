import type { EndoRadiographicFindingKey, EndoRadiographicFindings } from '@/types/endoAnnex.types'
import { ENDO_RADIOGRAPHIC_FINDING_OPTIONS } from '@/types/endoAnnex.types'

interface RadiographicFindingsSectionProps {
  value: EndoRadiographicFindings
  onChange: (value: EndoRadiographicFindings) => void
  disabled?: boolean
}

function chipClass(active: boolean, disabled?: boolean): string {
  if (disabled) return 'bg-slate-100 text-slate-400 cursor-not-allowed'
  if (!active) return 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
  return 'border-teal-300 bg-teal-50 text-teal-900'
}

export function RadiographicFindingsSection({
  value,
  onChange,
  disabled = false,
}: RadiographicFindingsSectionProps) {
  const selected = value.selected ?? []

  const toggleFinding = (key: EndoRadiographicFindingKey) => {
    const isActive = selected.includes(key)

    if (key === 'normal') {
      onChange({
        ...value,
        selected: isActive ? [] : ['normal'],
      })
      return
    }

    const withoutNormal = selected.filter((item) => item !== 'normal')
    const next = isActive
      ? withoutNormal.filter((item) => item !== key)
      : [...withoutNormal, key]

    onChange({ ...value, selected: next })
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
      <div className="mb-2">
        <h6 className="text-xs font-semibold text-slate-800">Hallazgos Radiográficos</h6>
        <p className="text-[11px] text-slate-500">
          Seleccione los hallazgos observados en la radiografía periapical o complementaria.
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {ENDO_RADIOGRAPHIC_FINDING_OPTIONS.map((option) => {
          const active = selected.includes(option.value)
          return (
            <button
              key={option.value}
              type="button"
              disabled={disabled}
              onClick={() => toggleFinding(option.value)}
              className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition ${chipClass(
                active,
                disabled,
              )}`}
            >
              {option.label}
            </button>
          )
        })}
      </div>

      <div className="mt-2">
        <label className="label-field" htmlFor="endo-radiographic-notes">
          Observaciones radiográficas
        </label>
        <textarea
          id="endo-radiographic-notes"
          rows={2}
          disabled={disabled}
          value={value.notes}
          onChange={(event) => onChange({ ...value, notes: event.target.value })}
          placeholder="Ej.: lesión periapical de 4 mm en ápice mesial, conducto MB calcificado..."
          className="input-field resize-y text-sm"
        />
      </div>
    </div>
  )
}
