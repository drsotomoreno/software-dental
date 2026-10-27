import { ALL_DECIDUOUS_TEETH, ALL_TEETH_NUMBERS, DIAGNOSIS_ANATOMICAL_SCOPE_LABELS } from '@/constants/dental'
import type { DiagnosisAnatomicalScope } from '@/types/clinicalRecord'
import {
  anatomicalAssociationValue,
  fieldsFromDiagnosisAssociation,
  parseDiagnosisAssociation,
} from '@/utils/diagnosisAssociation'

export function DiagnosisAssociationOptions({
  placeholder = 'Diente, maxilar o toda la dentición',
}: {
  placeholder?: string
}) {
  return (
    <>
      <option value="">{placeholder}</option>
      <option value="maxilar_superior">{DIAGNOSIS_ANATOMICAL_SCOPE_LABELS.maxilar_superior}</option>
      <option value="maxilar_inferior">{DIAGNOSIS_ANATOMICAL_SCOPE_LABELS.maxilar_inferior}</option>
      <option value="denticion">{DIAGNOSIS_ANATOMICAL_SCOPE_LABELS.denticion}</option>
      <optgroup label="Diente permanente">
        {ALL_TEETH_NUMBERS.map((tooth) => (
          <option key={tooth} value={`tooth:${tooth}`}>
            Pieza {tooth}
          </option>
        ))}
      </optgroup>
      <optgroup label="Diente temporal">
        {ALL_DECIDUOUS_TEETH.map((tooth) => (
          <option key={tooth} value={`tooth:${tooth}`}>
            Pieza {tooth}
          </option>
        ))}
      </optgroup>
    </>
  )
}

export function AnatomicalAssociationSelect({
  toothNumber,
  anatomicalScope,
  disabled = false,
  pending = false,
  ariaLabel,
  label = 'Asociar a',
  onChange,
}: {
  toothNumber?: number
  anatomicalScope?: DiagnosisAnatomicalScope
  disabled?: boolean
  pending?: boolean
  ariaLabel: string
  label?: string
  onChange: (next: { toothNumber?: number; anatomicalScope?: DiagnosisAnatomicalScope }) => void
}) {
  const value = anatomicalAssociationValue({ toothNumber, anatomicalScope })
  return (
    <div>
      <label className="label-field">{label}</label>
      <select
        disabled={disabled}
        value={value}
        aria-label={ariaLabel}
        className={`input-field ${pending && !value ? 'border-amber-400' : ''}`}
        onChange={(event) =>
          onChange(fieldsFromDiagnosisAssociation(parseDiagnosisAssociation(event.target.value)))
        }
      >
        <DiagnosisAssociationOptions />
      </select>
      {pending && !value && (
        <p className="mt-1 text-xs text-amber-700">
          Elija un diente, un maxilar o toda la dentición.
        </p>
      )}
    </div>
  )
}
