import {
  ALVEOLAR_RIDGE_CLASS_OPTIONS,
  LEKHOLM_ZARB_OPTIONS,
  type AlveolarRidgeClass,
  type LekholmZarbBoneType,
  type QuadrantBoneAssessment,
} from '@/constants/boneClassification'

interface BoneClassificationSelectorsProps {
  value: QuadrantBoneAssessment
  onChange: (patch: Partial<QuadrantBoneAssessment>) => void
  disabled?: boolean
  compact?: boolean
  showRidgeClass?: boolean
  idPrefix?: string
}

export function BoneClassificationSelectors({
  value,
  onChange,
  disabled = false,
  compact = false,
  showRidgeClass = true,
  idPrefix = 'bone',
}: BoneClassificationSelectorsProps) {
  const selectedLekholm = LEKHOLM_ZARB_OPTIONS.find((item) => item.id === value.lekholmZarb)

  return (
    <div className={compact ? 'space-y-2' : 'space-y-3'}>
      <div>
        <p className="text-[11px] font-medium text-slate-600">Lekholm y Zarb — densidad ósea</p>
        <div className="mt-1.5 flex flex-wrap gap-1">
          {LEKHOLM_ZARB_OPTIONS.map((option) => {
            const active = value.lekholmZarb === option.id
            return (
              <button
                key={option.id}
                type="button"
                disabled={disabled}
                title={option.description}
                onClick={() =>
                  onChange({ lekholmZarb: active ? '' : (option.id as LekholmZarbBoneType) })
                }
                className={`rounded-md border px-2 py-1 text-[11px] font-semibold transition ${
                  active
                    ? 'border-dental-500 bg-dental-50 text-dental-800'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                } disabled:cursor-not-allowed disabled:opacity-50`}
              >
                {option.id}
              </button>
            )
          })}
        </div>
        {selectedLekholm && (
          <p className="mt-1 text-[10px] leading-snug text-slate-500">
            <span className="font-medium text-slate-600">{selectedLekholm.label}:</span>{' '}
            {selectedLekholm.description}
          </p>
        )}
      </div>

      {showRidgeClass && (
        <label className="block text-[11px] text-slate-500">
          Morfología del reborde (opcional)
          <select
            id={`${idPrefix}-ridge-class`}
            value={value.ridgeClass}
            disabled={disabled}
            onChange={(event) =>
              onChange({ ridgeClass: event.target.value as AlveolarRidgeClass | '' })
            }
            className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700"
          >
            <option value="">Sin clasificar</option>
            {ALVEOLAR_RIDGE_CLASS_OPTIONS.map((option) => (
              <option key={option.id} value={option.id} title={option.description}>
                {option.label} — {option.description}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  )
}
