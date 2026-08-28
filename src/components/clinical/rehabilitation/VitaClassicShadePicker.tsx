import {
  VITA_CLASSIC_SHADE_GROUPS,
  VITA_CLASSIC_SHADES,
  VITA_MULTIPLE_COLORS_LABEL,
  VITA_MULTIPLE_COLORS_VALUE,
  type RehabArchToothColorSelection,
} from '@/constants/vitaClassicShades'

interface VitaClassicShadePickerProps {
  label: string
  inputId: string
  value: RehabArchToothColorSelection
  onChange: (value: RehabArchToothColorSelection) => void
  disabled?: boolean
}

export function VitaClassicShadePicker({
  label,
  inputId,
  value,
  onChange,
  disabled = false,
}: VitaClassicShadePickerProps) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <label htmlFor={inputId} className="mb-1 block text-sm font-semibold text-slate-800">
        {label}
      </label>
      <p className="mb-3 text-xs text-slate-500">
        Seleccione la nomenclatura VITA clásica o indique dentición con múltiples colores.
      </p>

      <select
        id={inputId}
        disabled={disabled}
        value={value}
        onChange={(e) => onChange(e.target.value as RehabArchToothColorSelection)}
        className={`input-field w-full text-sm ${
          value === VITA_MULTIPLE_COLORS_VALUE ? 'font-bold' : ''
        }`}
      >
        <option value="">— Seleccionar —</option>
        <option value={VITA_MULTIPLE_COLORS_VALUE} style={{ fontWeight: 700 }}>
          {VITA_MULTIPLE_COLORS_LABEL}
        </option>
        {VITA_CLASSIC_SHADE_GROUPS.map((group) => (
          <optgroup key={group.id} label={group.label}>
            {VITA_CLASSIC_SHADES.filter((shade) => shade.group === group.id).map((shade) => (
              <option key={shade.id} value={shade.id}>
                {shade.id}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </div>
  )
}
