import { FDI_QUADRANT_LABELS, FDI_QUADRANT_ORDER, type ImplantFdiQuadrant } from '@/constants/implantPlanning'
import {
  getCupsLocationRule,
  requiresFdiQuadrant,
  requiresFdiTooth,
} from '@/utils/cupsLocationRules'

interface CupsAnatomicalLocationFieldProps {
  cupsCode?: string
  toothNumber?: number
  fdiQuadrant?: ImplantFdiQuadrant
  arch?: 'superior' | 'inferior'
  disabled?: boolean
  onToothNumberChange: (toothNumber: number | undefined) => void
  onFdiQuadrantChange: (quadrant: ImplantFdiQuadrant | undefined) => void
  onArchChange: (arch: 'superior' | 'inferior' | undefined) => void
}

export function CupsAnatomicalLocationField({
  cupsCode,
  toothNumber,
  fdiQuadrant,
  arch,
  disabled = false,
  onToothNumberChange,
  onFdiQuadrantChange,
  onArchChange,
}: CupsAnatomicalLocationFieldProps) {
  const rule = getCupsLocationRule(cupsCode)
  const toothRequired = requiresFdiTooth(cupsCode)
  const quadrantRequired = requiresFdiQuadrant(cupsCode)

  if (!cupsCode) {
    return (
      <div>
        <label className="mb-0.5 block text-[10px] text-slate-500">Ubicación</label>
        <p className="text-xs text-slate-400">Seleccione un CUPS</p>
      </div>
    )
  }

  if (quadrantRequired) {
    return (
      <div>
        <label className="mb-0.5 block text-[10px] text-slate-500">
          Cuadrante FDI {quadrantRequired ? '*' : ''}
        </label>
        <select
          disabled={disabled}
          value={fdiQuadrant ?? ''}
          onChange={(event) =>
            onFdiQuadrantChange(
              event.target.value ? (event.target.value as ImplantFdiQuadrant) : undefined,
            )
          }
          className="input-field text-xs"
        >
          <option value="">Seleccionar sector…</option>
          {FDI_QUADRANT_ORDER.map((quadrant) => (
            <option key={quadrant} value={quadrant}>
              {quadrant} — {FDI_QUADRANT_LABELS[quadrant]}
            </option>
          ))}
        </select>
        <p className="mt-1 text-[10px] leading-snug text-slate-500">{rule.hint}</p>
      </div>
    )
  }

  if (rule.scope === 'arch') {
    return (
      <div>
        <label className="mb-0.5 block text-[10px] text-slate-500">Arcada *</label>
        <select
          disabled={disabled}
          value={arch ?? ''}
          onChange={(event) =>
            onArchChange(
              event.target.value
                ? (event.target.value as 'superior' | 'inferior')
                : undefined,
            )
          }
          className="input-field text-xs"
        >
          <option value="">Seleccionar…</option>
          <option value="superior">Superior</option>
          <option value="inferior">Inferior</option>
        </select>
        <p className="mt-1 text-[10px] leading-snug text-slate-500">{rule.hint}</p>
      </div>
    )
  }

  return (
    <div>
      <label className="mb-0.5 block text-[10px] text-slate-500">
        Pieza FDI {toothRequired ? '*' : ''}
      </label>
      <input
        type="number"
        min={11}
        max={85}
        disabled={disabled}
        value={toothNumber ?? ''}
        onChange={(event) =>
          onToothNumberChange(event.target.value ? Number(event.target.value) : undefined)
        }
        placeholder={toothRequired ? 'Obligatorio' : 'Opcional'}
        className={`input-field ${toothRequired && !toothNumber ? 'border-amber-400' : ''}`}
      />
      <p className="mt-1 text-[10px] leading-snug text-slate-500">{rule.hint}</p>
    </div>
  )
}
