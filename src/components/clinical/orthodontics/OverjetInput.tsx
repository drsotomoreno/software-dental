import {
  OVERJET_CLASSIFICATION_OPTIONS,
  type OverjetAssessment,
  type OverjetClassification,
} from '@/types/orthodonticsAnnex'

export interface OverjetInputProps {
  value: OverjetAssessment
  onChange: (value: OverjetAssessment) => void
  disabled?: boolean
  /** Integrado dentro de Maloclusión Dental (sin recuadro propio) */
  embedded?: boolean
}

function optionClass(active: boolean, disabled?: boolean): string {
  if (disabled) return 'bg-slate-100 text-slate-400 cursor-not-allowed'
  if (active) return 'bg-dental-600 text-white shadow-sm'
  return 'bg-slate-100 text-slate-700 hover:bg-slate-200'
}

function parseOverjetMmInput(raw: string): number | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const parsed = Number(trimmed.replace(',', '.'))
  if (!Number.isFinite(parsed) || parsed <= 0) return null
  return Math.round(parsed * 10) / 10
}

export default function OverjetInput({
  value,
  onChange,
  disabled = false,
  embedded = false,
}: OverjetInputProps) {
  const showMeasurement =
    value.classification === 'aumentado' || value.classification === 'invertido'

  const handleClassification = (classification: Exclude<OverjetClassification, ''>) => {
    if (value.classification === classification) {
      onChange({ classification: '', valueMm: null })
      return
    }

    onChange({
      classification,
      valueMm: classification === 'normal' ? null : value.valueMm,
    })
  }

  const handleValueChange = (raw: string) => {
    onChange({
      ...value,
      valueMm: parseOverjetMmInput(raw),
    })
  }

  const signedPreview =
    value.classification === 'invertido' && value.valueMm != null
      ? `-${value.valueMm}`
      : value.valueMm != null
        ? String(value.valueMm)
        : ''

  return (
    <div
      className={
        embedded
          ? 'min-w-0'
          : 'flex h-full min-w-0 flex-col rounded-xl border border-slate-200 bg-white p-4'
      }
    >
      {embedded ? (
        <p className="label-field mb-2">Sobremordida horizontal (Over Jet)</p>
      ) : (
        <h5 className="mb-3 text-sm font-semibold leading-snug text-slate-800">
          Sobremordida Horizontal Over Jet
        </h5>
      )}

      <p className="mb-2 text-xs font-medium text-slate-600">Clasificación</p>
      <div className="flex flex-col gap-1.5">
        {OVERJET_CLASSIFICATION_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            disabled={disabled}
            onClick={() => handleClassification(option.value)}
            className={`rounded-full px-3 py-1.5 text-center text-xs font-medium transition ${optionClass(
              value.classification === option.value,
              disabled,
            )}`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {showMeasurement && (
        <div className="mt-4">
          <label className="label-field" htmlFor="orthodontics-overjet-mm">
            Medición (mm)
          </label>
          <div className="flex items-center gap-2">
            {value.classification === 'invertido' && (
              <span className="text-lg font-semibold text-slate-700" aria-hidden>
                −
              </span>
            )}
            <input
              id="orthodontics-overjet-mm"
              type="number"
              min={0}
              max={30}
              step={0.5}
              disabled={disabled}
              value={value.valueMm ?? ''}
              onChange={(event) => handleValueChange(event.target.value)}
              placeholder="0"
              className="input-field min-w-0 flex-1 font-mono tabular-nums"
            />
            <span className="text-sm text-slate-500">mm</span>
          </div>
          {signedPreview && (
            <p className="mt-1 text-xs text-slate-500">
              Valor registrado:{' '}
              <span className="font-mono font-medium text-slate-700">{signedPreview} mm</span>
            </p>
          )}
        </div>
      )}
    </div>
  )
}
