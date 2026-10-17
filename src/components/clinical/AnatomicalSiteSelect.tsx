import { FDI_QUADRANT_LABELS, type ImplantFdiQuadrant } from '@/constants/implantPlanning'
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
import {
  ZONE_GENERAL,
  ZONE_LOWER_ARCH,
  ZONE_UPPER_ARCH,
  formatAnatomicalZone,
} from '@/utils/treatmentPlanZone'

export interface AnatomicalSiteValue {
  anatomicalZone?: string
  toothNumber?: number
  fdiQuadrant?: ImplantFdiQuadrant
  arch?: 'superior' | 'inferior'
}

interface AnatomicalSiteSelectProps {
  id: string
  value: AnatomicalSiteValue
  disabled?: boolean
  onChange: (raw: string) => void
}

const ZONE_OPTIONS: { value: string; label: string }[] = [
  { value: ZONE_GENERAL, label: 'General' },
  { value: ZONE_UPPER_ARCH, label: 'Arcada superior' },
  { value: ZONE_LOWER_ARCH, label: 'Arcada inferior' },
  { value: 'Q1', label: FDI_QUADRANT_LABELS.Q1 },
  { value: 'Q2', label: FDI_QUADRANT_LABELS.Q2 },
  { value: 'Q3', label: FDI_QUADRANT_LABELS.Q3 },
  { value: 'Q4', label: FDI_QUADRANT_LABELS.Q4 },
]

const TOOTH_GROUPS: { label: string; teeth: readonly number[] }[] = [
  { label: 'Permanentes — superior derecho', teeth: [...UPPER_RIGHT].sort((a, b) => a - b) },
  { label: 'Permanentes — superior izquierdo', teeth: [...UPPER_LEFT].sort((a, b) => a - b) },
  { label: 'Permanentes — inferior izquierdo', teeth: [...LOWER_LEFT].sort((a, b) => a - b) },
  { label: 'Permanentes — inferior derecho', teeth: [...LOWER_RIGHT].sort((a, b) => a - b) },
  { label: 'Temporales — superior derecho', teeth: [...DECIDUOUS_UPPER_RIGHT].sort((a, b) => a - b) },
  { label: 'Temporales — superior izquierdo', teeth: [...DECIDUOUS_UPPER_LEFT].sort((a, b) => a - b) },
  { label: 'Temporales — inferior izquierdo', teeth: [...DECIDUOUS_LOWER_LEFT].sort((a, b) => a - b) },
  { label: 'Temporales — inferior derecho', teeth: [...DECIDUOUS_LOWER_RIGHT].sort((a, b) => a - b) },
]

const KNOWN_VALUES = new Set<string>([
  ...ZONE_OPTIONS.map((option) => option.value),
  ...TOOTH_GROUPS.flatMap((group) => group.teeth.map(String)),
])

export function AnatomicalSiteSelect({
  id,
  value,
  disabled = false,
  onChange,
}: AnatomicalSiteSelectProps) {
  const current = formatAnatomicalZone(value)

  return (
    <div className="mt-3">
      <label className="label-field" htmlFor={id}>
        Diente o zona
      </label>
      <select
        id={id}
        disabled={disabled}
        value={current}
        onChange={(event) => onChange(event.target.value)}
        className="input-field"
        aria-label="Diente o zona del procedimiento"
      >
        <option value="">Seleccione el diente o la zona…</option>
        {current && !KNOWN_VALUES.has(current) && <option value={current}>{current}</option>}
        <optgroup label="Zonas">
          {ZONE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </optgroup>
        {TOOTH_GROUPS.map((group) => (
          <optgroup key={group.label} label={group.label}>
            {group.teeth.map((tooth) => (
              <option key={tooth} value={String(tooth)}>
                {tooth}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      <p className="mt-1 text-[10px] text-slate-400">
        Pieza FDI o zona en la que se realiza este procedimiento.
      </p>
    </div>
  )
}
