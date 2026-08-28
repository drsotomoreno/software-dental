import { memo } from 'react'
import type { ToothNumber } from '@/types/odontogram'
import type { PeriodontalToothRecord } from '@/types/periodonticsAnnex'
import { getToothSummary, isToothEvaluable } from '@/utils/periodonticsAnnex'

interface PeriodontogramToothCellProps {
  tooth: PeriodontalToothRecord
  selected: boolean
  disabled?: boolean
  onSelect: (number: ToothNumber) => void
}

function PeriodontogramToothCellComponent({
  tooth,
  selected,
  disabled = false,
  onSelect,
}: PeriodontogramToothCellProps) {
  const evaluable = isToothEvaluable(tooth)
  const summary = getToothSummary(tooth)
  const isDeep = summary.maxPbs !== null && summary.maxPbs >= 5

  const statusLabel =
    tooth.clinicalStatus === 'presente'
      ? ''
      : tooth.clinicalStatus === 'implante'
        ? 'IMP'
        : tooth.clinicalStatus === 'corona'
          ? 'CR'
          : tooth.clinicalStatus === 'retenido'
            ? 'RET'
            : 'AUS'

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onSelect(tooth.number)}
      className={`flex min-h-[72px] flex-col items-center justify-center rounded-lg border px-1 py-2 text-center transition ${
        selected
          ? 'border-dental-600 bg-dental-50 ring-2 ring-dental-400'
          : 'border-slate-200 bg-white hover:border-dental-300 hover:bg-dental-50/40'
      } ${!evaluable ? 'bg-slate-100 opacity-80' : ''} ${isDeep ? 'shadow-[inset_0_0_0_2px_rgba(220,38,38,0.35)]' : ''}`}
      title={`Pieza ${tooth.number}`}
    >
      <span className="text-sm font-bold text-slate-800">{tooth.number}</span>
      {statusLabel && (
        <span className="mt-0.5 rounded bg-slate-700 px-1 text-[9px] font-semibold text-white">
          {statusLabel}
        </span>
      )}
      {evaluable && summary.maxPbs !== null && (
        <span
          className={`mt-1 text-[10px] font-semibold ${isDeep ? 'text-red-600' : 'text-slate-600'}`}
        >
          PBS {summary.maxPbs} mm
        </span>
      )}
      {evaluable && summary.hasBleeding && (
        <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-red-500" aria-label="Sangrado" />
      )}
    </button>
  )
}

export const PeriodontogramToothCell = memo(PeriodontogramToothCellComponent)
