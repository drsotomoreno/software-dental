import type { PlacedImplant } from '@/types/dentalImplantsPlanning'
import type { ImplantFixtureSize } from '@/constants/implantPlanning'
import { parseImplantFixtureDimensions } from '@/constants/implantPlanning'

interface ImplantMarkerProps {
  implant: PlacedImplant
  selected: boolean
  disabled?: boolean
  onSelect: (id: string) => void
  onPointerDown: (id: string, event: React.PointerEvent<SVGGElement>) => void
}

interface ImplantDimensions {
  halfWidth: number
  headHeight: number
  bodyLength: number
  tipRadius: number
}

function parseImplantDimensions(size: ImplantFixtureSize): ImplantDimensions {
  const { diameter, length } = parseImplantFixtureDimensions(size)

  const halfWidth = 3.8 + diameter * 1.15
  const bodyLength = 10 + length * 1.65
  const headHeight = Math.max(5.5, bodyLength * 0.22)
  const tipRadius = halfWidth * 0.22

  return { halfWidth, headHeight, bodyLength, tipRadius }
}

function hexSocketPoints(halfWidth: number, headTop: number): string {
  const radius = halfWidth * 0.28
  return Array.from({ length: 6 }, (_, index) => {
    const angle = (Math.PI / 3) * index - Math.PI / 6
    const x = radius * Math.cos(angle)
    const y = headTop + radius * Math.sin(angle) * 0.35
    return `${x.toFixed(2)},${y.toFixed(2)}`
  }).join(' ')
}

function ImplantScrewGraphic({
  implantId,
  dimensions,
  selected,
}: {
  implantId: string
  dimensions: ImplantDimensions
  selected: boolean
}) {
  const { halfWidth, headHeight, bodyLength, tipRadius } = dimensions
  const headTop = -headHeight
  const bodyBottom = bodyLength
  const tipY = bodyBottom + tipRadius * 0.8
  const neckY = headHeight * 0.12
  const threadCount = Math.max(8, Math.round(bodyLength / 2.8))
  const threadStep = (bodyBottom - neckY) / threadCount
  const bodyBottomWidth = halfWidth * 0.42

  const headGradId = `implant-head-${implantId}`
  const bodyGradId = `implant-body-${implantId}`
  const capGradId = `implant-cap-${implantId}`

  const bodyPath = [
    `M ${-halfWidth} ${neckY}`,
    `L ${-bodyBottomWidth} ${bodyBottom}`,
    `Q 0 ${tipY} ${bodyBottomWidth} ${bodyBottom}`,
    `L ${halfWidth} ${neckY}`,
    `Q 0 ${neckY - headHeight * 0.15} ${-halfWidth} ${neckY}`,
    'Z',
  ].join(' ')

  return (
    <g pointerEvents="none">
      <defs>
        <linearGradient id={headGradId} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#f3f4f6" />
          <stop offset="45%" stopColor="#d1d5db" />
          <stop offset="100%" stopColor="#9ca3af" />
        </linearGradient>
        <linearGradient id={capGradId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#e5e7eb" />
          <stop offset="100%" stopColor="#9ca3af" />
        </linearGradient>
        <linearGradient id={bodyGradId} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#e5e7eb" />
          <stop offset="40%" stopColor="#cbd5e1" />
          <stop offset="100%" stopColor="#94a3b8" />
        </linearGradient>
        <clipPath id={`implant-body-clip-${implantId}`}>
          <path d={bodyPath} />
        </clipPath>
      </defs>

      <path
        d={bodyPath}
        fill={`url(#${bodyGradId})`}
        stroke={selected ? '#0f766e' : '#6b7280'}
        strokeWidth={selected ? 1.4 : 1}
      />

      <g clipPath={`url(#implant-body-clip-${implantId})`}>
        {Array.from({ length: threadCount }, (_, index) => {
          const y = neckY + threadStep * (index + 0.5)
          const taper = 1 - (y - neckY) / (bodyBottom - neckY) * 0.58
          const threadHalfWidth = halfWidth * taper
          const bulge = threadStep * 0.22
          return (
            <path
              key={y}
              d={`M ${-threadHalfWidth} ${y - bulge} Q 0 ${y + bulge} ${threadHalfWidth} ${y - bulge}`}
              fill="none"
              stroke="#64748b"
              strokeWidth={0.85}
            />
          )
        })}
      </g>

      <path
        d={[
          `M ${-halfWidth * 0.92} ${neckY}`,
          `L ${-halfWidth * 0.92} ${headTop + headHeight * 0.2}`,
          `Q ${-halfWidth * 0.92} ${headTop} 0 ${headTop}`,
          `Q ${halfWidth * 0.92} ${headTop} ${halfWidth * 0.92} ${headTop + headHeight * 0.2}`,
          `L ${halfWidth * 0.92} ${neckY}`,
          `Q 0 ${neckY - headHeight * 0.18} ${-halfWidth * 0.92} ${neckY}`,
          'Z',
        ].join(' ')}
        fill={`url(#${headGradId})`}
        stroke={selected ? '#0f766e' : '#9ca3af'}
        strokeWidth={selected ? 1.4 : 1}
      />

      <ellipse
        cx={0}
        cy={headTop}
        rx={halfWidth * 0.92}
        ry={headHeight * 0.28}
        fill={`url(#${capGradId})`}
        stroke="#9ca3af"
        strokeWidth={0.8}
      />

      <polygon points={hexSocketPoints(halfWidth, headTop)} fill="#374151" stroke="#1f2937" strokeWidth={0.6} />

      <circle cx={0} cy={headTop} r={halfWidth * 0.08} fill="#111827" opacity={0.55} />

      <ellipse
        cx={halfWidth * 0.55}
        cy={headTop + headHeight * 0.08}
        rx={halfWidth * 0.18}
        ry={headHeight * 0.06}
        fill="#ffffff"
        opacity={0.35}
      />
    </g>
  )
}

export function ImplantMarker({
  implant,
  selected,
  disabled = false,
  onSelect,
  onPointerDown,
}: ImplantMarkerProps) {
  const dimensions = parseImplantDimensions(implant.size)
  const baseRotation = implant.arch === 'upper' ? 180 : 0
  const totalRotation = baseRotation + implant.rotation
  const labelOffset =
    implant.arch === 'upper'
      ? -(dimensions.bodyLength + dimensions.headHeight + 14)
      : dimensions.bodyLength + dimensions.headHeight + 14

  return (
    <g
      transform={`translate(${implant.x} ${implant.y}) rotate(${totalRotation})`}
      className={disabled ? 'cursor-default' : 'cursor-grab active:cursor-grabbing'}
      onPointerDown={(event) => {
        if (disabled) return
        event.stopPropagation()
        onSelect(implant.id)
        onPointerDown(implant.id, event)
      }}
    >
      {selected && (
        <rect
          x={-dimensions.halfWidth - 6}
          y={-dimensions.headHeight - 4}
          width={(dimensions.halfWidth + 6) * 2}
          height={dimensions.bodyLength + dimensions.headHeight + dimensions.tipRadius + 10}
          rx={4}
          fill="none"
          stroke="#0f766e"
          strokeWidth={1.4}
          strokeDasharray="4 3"
          pointerEvents="none"
        />
      )}

      <ImplantScrewGraphic implantId={implant.id} dimensions={dimensions} selected={selected} />

      <text
        y={labelOffset}
        textAnchor="middle"
        fontSize={10}
        fontWeight={600}
        fill="#334155"
        transform={`rotate(${-totalRotation})`}
        pointerEvents="none"
      >
        {implant.quadrant}
      </text>
    </g>
  )
}
