import type { RehabTreatmentType } from './types'
import { REHAB_SELECTION_COLOR } from './constants'
import { getImplantScrew, getToothShape } from './toothShapes'

interface RehabToothFigureProps {
  fdi: number
  arch: 'upper' | 'lower'
  isSelected: boolean
  eliminado?: boolean
  treatment?: RehabTreatmentType
  treatmentColor?: string
  disabled?: boolean
  onClick: () => void
}

const IMPLANT_GRAY = '#6B7280'

export function RehabToothFigure({
  fdi,
  arch,
  isSelected,
  eliminado = false,
  treatment,
  treatmentColor,
  disabled = false,
  onClick,
}: RehabToothFigureProps) {
  const shape = getToothShape(fdi)
  const isImplant = treatment === 'implante'
  const isPontic = treatment === 'pontico_ppf'
  const showImage = !eliminado || Boolean(treatment)
  const screw = isImplant ? getImplantScrew(fdi) : null
  const activeColor = isImplant ? IMPLANT_GRAY : treatmentColor
  const fillColor = activeColor ? `${activeColor}40` : '#ffffff'
  const strokeColor = activeColor ?? '#64748b'
  const strokeWidth = isSelected ? 2.5 : activeColor ? 2 : 1.25
  const selectionRing = isSelected ? REHAB_SELECTION_COLOR : 'transparent'
  const viewW = shape.width + 4
  const viewH = shape.height + 4

  const titleSuffix = eliminado
    ? treatment
      ? ` — Eliminado / ${treatment === 'implante' ? 'Implante' : 'Póntico PPF'}`
      : ' — Eliminado'
    : isImplant
      ? ' — Implante'
      : ''

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      title={`Pieza ${fdi}${titleSuffix}`}
      aria-label={`Pieza dental ${fdi}`}
      aria-pressed={isSelected}
      className={`group flex shrink-0 flex-col items-center gap-1 rounded-md px-1 py-1.5 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-dental-500 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50 ${
        isSelected ? 'bg-blue-50 shadow-sm ring-1 ring-blue-200' : 'hover:bg-slate-50'
      } ${eliminado && !treatment ? 'bg-slate-50/80' : ''}`}
      style={{ width: shape.width + 16 }}
    >
      <span
        className={`text-[10px] font-bold leading-none ${
          isSelected ? 'text-blue-700' : eliminado && !treatment ? 'text-slate-400' : 'text-slate-600'
        }`}
      >
        {fdi}
      </span>
      <div className="relative">
        {activeColor && showImage && (
          <span
            className="absolute -right-0.5 -top-0.5 z-10 h-2.5 w-2.5 rounded-full border border-white shadow-sm"
            style={{ backgroundColor: activeColor }}
          />
        )}
        {showImage ? (
          <svg
            width={viewW + 4}
            height={viewH + 4}
            viewBox={`0 0 ${viewW} ${viewH}`}
            className={`overflow-visible ${arch === 'lower' ? 'rotate-180' : ''}`}
            aria-hidden
          >
            <rect
              x="1"
              y="1"
              width={viewW - 2}
              height={viewH - 2}
              rx="4"
              fill="none"
              stroke={selectionRing}
              strokeWidth="2"
            />
            <g transform="translate(2, 2)">
              {isImplant && screw ? (
                <>
                  <path
                    d={screw.body}
                    fill="#9ca3af"
                    stroke={IMPLANT_GRAY}
                    strokeWidth={strokeWidth}
                    strokeLinejoin="round"
                  />
                  {screw.threads.map((thread, index) => (
                    <path
                      key={`thread-${index}`}
                      d={thread}
                      fill="none"
                      stroke="#4b5563"
                      strokeWidth="1.1"
                      strokeLinecap="round"
                    />
                  ))}
                  <path
                    d={screw.collar}
                    fill="none"
                    stroke={IMPLANT_GRAY}
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </>
              ) : (
                !isPontic && (
                  <path
                    d={shape.root}
                    fill="#f1f5f9"
                    stroke={strokeColor}
                    strokeWidth={strokeWidth}
                    strokeLinejoin="round"
                  />
                )
              )}

              <path
                d={shape.crown}
                fill={fillColor}
                stroke={strokeColor}
                strokeWidth={strokeWidth}
                strokeLinejoin="round"
              />

              {!isPontic && shape.neck && (
                <path
                  d={shape.neck}
                  fill="none"
                  stroke={strokeColor}
                  strokeWidth="1"
                  strokeLinecap="round"
                  opacity="0.7"
                />
              )}

              {!isImplant && !isPontic && shape.buccalHighlight && (
                <path
                  d={shape.buccalHighlight}
                  fill="none"
                  stroke={treatmentColor ?? '#cbd5e1'}
                  strokeWidth="1"
                  strokeLinecap="round"
                  opacity="0.85"
                />
              )}
            </g>
          </svg>
        ) : (
          <div
            className={`flex items-center justify-center rounded border border-dashed ${
              isSelected ? 'border-blue-300 bg-blue-50/50' : 'border-slate-300 bg-slate-50'
            }`}
            style={{ width: viewW + 4, height: viewH + 4 }}
            aria-hidden
          >
            <span className="text-[9px] font-medium uppercase tracking-wide text-slate-400">—</span>
          </div>
        )}
      </div>
    </button>
  )
}
