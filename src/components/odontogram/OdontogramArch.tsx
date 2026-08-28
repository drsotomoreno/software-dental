import type { AnyToothNumber } from '@/types/odontogram'
import { Tooth } from './Tooth'
import type { ToothFace, ToothFaceState, ToothGlobalState, ToothRecord } from '@/types/odontogram'

interface OdontogramArchProps {
  title: string
  subtitle: string
  upperRight: AnyToothNumber[]
  upperLeft: AnyToothNumber[]
  lowerLeft: AnyToothNumber[]
  lowerRight: AnyToothNumber[]
  getTooth: (number: AnyToothNumber) => ToothRecord
  activeTool: ToothFaceState
  activeGlobalTool?: ToothGlobalState | null
  disabled?: boolean
  onFaceChange: (number: AnyToothNumber, face: ToothFace, state: ToothFaceState) => void
  onGlobalStateChange: (number: AnyToothNumber, state: ToothGlobalState) => void
}

export function OdontogramArch({
  title,
  subtitle,
  upperRight,
  upperLeft,
  lowerLeft,
  lowerRight,
  getTooth,
  activeTool,
  activeGlobalTool = null,
  disabled,
  onFaceChange,
  onGlobalStateChange,
}: OdontogramArchProps) {
  const colCount = upperRight.length + upperLeft.length
  const toothWidth = colCount <= 10 ? 88 : 80

  const renderRow = (numbers: AnyToothNumber[], row: 'upper' | 'lower') =>
    numbers.map((num) => (
      <Tooth
        key={num}
        tooth={getTooth(num)}
        activeTool={activeTool}
        activeGlobalTool={activeGlobalTool}
        row={row}
        disabled={disabled}
        onFaceChange={(face, state) => onFaceChange(num, face, state)}
        onGlobalStateChange={(state) => onGlobalStateChange(num, state)}
      />
    ))

  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-baseline gap-2">
        <h4 className="text-sm font-semibold text-slate-800">{title}</h4>
        <span className="text-xs text-slate-500">{subtitle}</span>
      </div>

      <div className="odontogram-scroll-container rounded-lg border border-slate-200 bg-white p-2">
        <div
          className="odontogram-grid"
          style={{ gridTemplateColumns: `repeat(${colCount}, ${toothWidth}px)` }}
        >
          {renderRow(upperRight, 'upper')}
          {renderRow(upperLeft, 'upper')}

          <div
            className="my-1 border-t-2 border-dashed border-slate-300"
            style={{ gridColumn: '1 / -1' }}
          />

          {renderRow(lowerLeft, 'lower')}
          {renderRow(lowerRight, 'lower')}
        </div>
      </div>
    </section>
  )
}
