import {
  SAGITTAL_FACIAL_PROFILE_OPTIONS,
  VERTICAL_FACIAL_TYPE_OPTIONS,
  type FacialAnalysis,
  type SagittalFacialProfile,
  type VerticalFacialType,
} from '@/types/orthodonticsAnnex'

export interface FacialProfileInputProps {
  value: FacialAnalysis
  onChange: (value: FacialAnalysis) => void
  disabled?: boolean
}

function optionClass(active: boolean, disabled?: boolean): string {
  if (disabled) return 'bg-slate-100 text-slate-400 cursor-not-allowed'
  if (active) return 'bg-dental-600 text-white shadow-sm'
  return 'bg-slate-100 text-slate-700 hover:bg-slate-200'
}

export default function FacialProfileInput({
  value,
  onChange,
  disabled = false,
}: FacialProfileInputProps) {
  const handleSagittalProfile = (profile: Exclude<SagittalFacialProfile, ''>) => {
    onChange({
      ...value,
      sagitalProfile: value.sagitalProfile === profile ? '' : profile,
    })
  }

  const handleVerticalFacialType = (type: Exclude<VerticalFacialType, ''>) => {
    onChange({
      ...value,
      verticalFacialType: value.verticalFacialType === type ? '' : type,
    })
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <h5 className="mb-3 text-sm font-semibold text-slate-800">Análisis Facial</h5>

      <div className="space-y-4">
        <div>
          <p className="label-field mb-2">Perfil facial sagital</p>
          <div className="flex flex-wrap gap-2">
            {SAGITTAL_FACIAL_PROFILE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                disabled={disabled}
                onClick={() => handleSagittalProfile(option.value)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${optionClass(
                  value.sagitalProfile === option.value,
                  disabled,
                )}`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="label-field mb-2">Tipo facial vertical</p>
          <div className="flex flex-wrap gap-2">
            {VERTICAL_FACIAL_TYPE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                disabled={disabled}
                onClick={() => handleVerticalFacialType(option.value)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${optionClass(
                  value.verticalFacialType === option.value,
                  disabled,
                )}`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
