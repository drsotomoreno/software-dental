import {
  DECIDUOUS_LOWER_LEFT,
  DECIDUOUS_LOWER_RIGHT,
  DECIDUOUS_UPPER_LEFT,
  DECIDUOUS_UPPER_RIGHT,
  LOWER_LEFT,
  LOWER_RIGHT,
  UPPER_LEFT,
  UPPER_RIGHT,
} from '@/constants/dental'
import { isValidFdiToothNumber } from '@/utils/cupsLocationRules'

interface FdiToothGroup {
  label: string
  teeth: readonly number[]
}

const FDI_TOOTH_GROUPS: FdiToothGroup[] = [
  { label: 'Superior derecho', teeth: UPPER_RIGHT },
  { label: 'Superior izquierdo', teeth: UPPER_LEFT },
  { label: 'Inferior izquierdo', teeth: LOWER_LEFT },
  { label: 'Inferior derecho', teeth: LOWER_RIGHT },
  { label: 'Temporal superior derecho', teeth: DECIDUOUS_UPPER_RIGHT },
  { label: 'Temporal superior izquierdo', teeth: DECIDUOUS_UPPER_LEFT },
  { label: 'Temporal inferior izquierdo', teeth: DECIDUOUS_LOWER_LEFT },
  { label: 'Temporal inferior derecho', teeth: DECIDUOUS_LOWER_RIGHT },
]

interface FdiToothSelectProps {
  id?: string
  value?: number
  onChange: (toothNumber: number | undefined) => void
  disabled?: boolean
  emptyLabel?: string
  /** Piezas ya registradas en odontograma o diagnósticos, para elegirlas primero */
  highlightedTeeth?: number[]
  invalid?: boolean
  className?: string
}

export function FdiToothSelect({
  id,
  value,
  onChange,
  disabled = false,
  emptyLabel = 'Sin pieza específica',
  highlightedTeeth = [],
  invalid = false,
  className = '',
}: FdiToothSelectProps) {
  const highlighted = [...new Set(highlightedTeeth.filter((tooth) => isValidFdiToothNumber(tooth)))].sort(
    (a, b) => a - b,
  )
  const highlightedSet = new Set(highlighted)
  const orphanValue =
    value != null &&
    !highlightedSet.has(value) &&
    !FDI_TOOTH_GROUPS.some((group) => group.teeth.includes(value))
      ? value
      : undefined

  return (
    <select
      id={id}
      disabled={disabled}
      value={value ?? ''}
      onChange={(event) =>
        onChange(event.target.value ? Number(event.target.value) : undefined)
      }
      className={`input-field ${invalid ? 'border-amber-400' : ''} ${className}`.trim()}
    >
      <option value="">{emptyLabel}</option>
      {orphanValue != null && (
        <option value={orphanValue}>Pieza {orphanValue}</option>
      )}
      {highlighted.length > 0 && (
        <optgroup label="Piezas del paciente">
          {highlighted.map((tooth) => (
            <option key={`patient-${tooth}`} value={tooth}>
              Pieza {tooth}
            </option>
          ))}
        </optgroup>
      )}
      {FDI_TOOTH_GROUPS.map((group) => {
        const teeth = group.teeth.filter((tooth) => !highlightedSet.has(tooth))
        if (teeth.length === 0) return null
        return (
          <optgroup key={group.label} label={group.label}>
            {teeth.map((tooth) => (
              <option key={`${group.label}-${tooth}`} value={tooth}>
                Pieza {tooth}
              </option>
            ))}
          </optgroup>
        )
      })}
    </select>
  )
}
