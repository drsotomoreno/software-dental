import { memo, useMemo } from 'react'
import type { ToothNumber } from '@/types/odontogram'
import type { PeriodontalToothRecord } from '@/types/periodonticsAnnex'
import { LOWER_FDI_ARCH, UPPER_FDI_ARCH } from '@/types/periodonticsAnnex'
import { PeriodontogramToothCell } from './PeriodontogramToothCell'

interface PeriodontogramChartProps {
  teeth: PeriodontalToothRecord[]
  selectedTooth: ToothNumber | null
  disabled?: boolean
  onSelectTooth: (number: ToothNumber) => void
}

function PeriodontogramChartComponent({
  teeth,
  selectedTooth,
  disabled = false,
  onSelectTooth,
}: PeriodontogramChartProps) {
  const toothMap = useMemo(() => new Map(teeth.map((t) => [t.number, t])), [teeth])

  const renderArch = (numbers: ToothNumber[], label: string) => (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <div className="grid grid-cols-8 gap-1 sm:grid-cols-16">
        {numbers.map((number) => {
          const tooth = toothMap.get(number)
          if (!tooth) return null
          return (
            <PeriodontogramToothCell
              key={number}
              tooth={tooth}
              selected={selectedTooth === number}
              disabled={disabled}
              onSelect={onSelectTooth}
            />
          )
        })}
      </div>
    </div>
  )

  return (
    <div className="space-y-4 rounded-xl border border-slate-200 bg-gradient-to-b from-white to-slate-50/80 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h4 className="text-sm font-semibold text-slate-800">Periodontograma (FDI 18–48)</h4>
          <p className="text-xs text-slate-500">Seleccione un diente para registrar los 6 sitios clínicos.</p>
        </div>
        <div className="flex flex-wrap gap-2 text-[10px] text-slate-500">
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-red-500" /> BoP
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded border border-red-400" /> PBS ≥ 5 mm
          </span>
        </div>
      </div>

      {renderArch(UPPER_FDI_ARCH, 'Maxilar superior')}
      <div className="border-t border-dashed border-slate-300" />
      {renderArch(LOWER_FDI_ARCH, 'Maxilar inferior')}
    </div>
  )
}

export const PeriodontogramChart = memo(PeriodontogramChartComponent)
