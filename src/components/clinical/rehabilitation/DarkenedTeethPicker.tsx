import { REHAB_ODONTOGRAM_TEETH } from '@/components/clinical/rehabilitation/rehab-odontogram/constants'

interface DarkenedTeethPickerProps {
  value: string[]
  onChange: (value: string[]) => void
  disabled?: boolean
}

const UPPER_TEETH = [
  ...REHAB_ODONTOGRAM_TEETH.upperRight,
  ...REHAB_ODONTOGRAM_TEETH.upperLeft,
]

const LOWER_TEETH = [
  ...REHAB_ODONTOGRAM_TEETH.lowerRight,
  ...REHAB_ODONTOGRAM_TEETH.lowerLeft,
]

function ToothNumberButton({
  fdi,
  selected,
  disabled,
  onToggle,
}: {
  fdi: number
  selected: boolean
  disabled: boolean
  onToggle: (fdi: number) => void
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onToggle(fdi)}
      aria-pressed={selected}
      className={`min-w-[2.25rem] rounded-md border px-2 py-1 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-45 ${
        selected
          ? 'border-dental-500 bg-dental-50 text-dental-800 shadow-sm'
          : 'border-slate-300 bg-white text-slate-600 hover:border-slate-400 hover:bg-slate-50'
      }`}
    >
      {fdi}
    </button>
  )
}

export function DarkenedTeethPicker({ value, onChange, disabled = false }: DarkenedTeethPickerProps) {
  const selected = new Set(value)

  const toggleTooth = (fdi: number) => {
    if (disabled) return
    const id = String(fdi)
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    onChange(Array.from(next).sort((a, b) => Number(a) - Number(b)))
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 lg:col-span-2">
      <p className="mb-1 text-sm font-semibold text-slate-800">Dientes Oscurecidos</p>
      <p className="mb-3 text-xs text-slate-500">
        Seleccione el número FDI de las piezas con oscurecimiento dental.
      </p>

      <div className="space-y-2">
        <div className="flex flex-wrap gap-1">
          {UPPER_TEETH.map((fdi) => (
            <ToothNumberButton
              key={fdi}
              fdi={fdi}
              selected={selected.has(String(fdi))}
              disabled={disabled}
              onToggle={toggleTooth}
            />
          ))}
        </div>
        <div className="flex flex-wrap gap-1">
          {LOWER_TEETH.map((fdi) => (
            <ToothNumberButton
              key={fdi}
              fdi={fdi}
              selected={selected.has(String(fdi))}
              disabled={disabled}
              onToggle={toggleTooth}
            />
          ))}
        </div>
      </div>

      {value.length > 0 && (
        <p className="mt-3 text-xs text-slate-600">
          Piezas seleccionadas: <strong>{value.join(', ')}</strong>
        </p>
      )}
    </div>
  )
}
