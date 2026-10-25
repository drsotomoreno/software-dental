import { ALL_TEETH_NUMBERS, DIAGNOSIS_ANATOMICAL_SCOPE_LABELS } from '@/constants/dental'

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
      <optgroup label="Diente">
        {ALL_TEETH_NUMBERS.map((tooth) => (
          <option key={tooth} value={`tooth:${tooth}`}>
            Pieza {tooth}
          </option>
        ))}
      </optgroup>
    </>
  )
}
