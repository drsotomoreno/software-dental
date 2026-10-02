import type { MouseEvent } from 'react'

interface AgendaSlotCellProps {
  blocked: boolean
  blockMode: boolean
  lunch?: boolean
  selected: boolean
  selectionMode: boolean
  top: string
  height: string
  ariaLabel: string
  slotMarker: string
  onClick: (event: MouseEvent<HTMLButtonElement>) => void
  onContextMenu: (event: MouseEvent<HTMLButtonElement>) => void
}

/** Casilla horaria de la grilla. El arrastre y los botones del mouse la marcan. */
export function AgendaSlotCell({
  blocked,
  blockMode,
  lunch = false,
  selected,
  selectionMode,
  top,
  height,
  ariaLabel,
  slotMarker,
  onClick,
  onContextMenu,
}: AgendaSlotCellProps) {
  return (
    <button
      type="button"
      data-agenda-slot={slotMarker}
      data-selected={selected ? 'true' : 'false'}
      aria-pressed={selected}
      aria-label={ariaLabel}
      onClick={onClick}
      onContextMenu={onContextMenu}
      className={`absolute w-full border-b border-slate-100 transition ${
        selectionMode ? 'z-40 touch-none' : ''
      } ${
        selectionMode
          ? `cursor-cell hover:bg-sky-100/80 ${lunch && !blocked && !selected ? 'agenda-lunch-slot' : ''}`
          : blocked
            ? 'cursor-not-allowed bg-black/5'
            : lunch
              ? blockMode
                ? 'agenda-lunch-slot hover:bg-black/10'
                : 'agenda-lunch-slot hover:bg-dental-50/60'
              : blockMode
                ? 'hover:bg-black/10'
                : 'hover:bg-dental-50/60'
      } ${selected ? 'agenda-slot-selected' : ''}`}
      style={{ top, height }}
    />
  )
}

interface AgendaSlotSelectionHighlightProps {
  timeSlots: string[]
  totalSlots: number
  selectedTimes: string[]
}

/** Capa visible encima de citas y bloqueos para las casillas marcadas. */
export function AgendaSlotSelectionHighlight({
  timeSlots,
  totalSlots,
  selectedTimes,
}: AgendaSlotSelectionHighlightProps) {
  return selectedTimes.map((time) => {
    const index = timeSlots.indexOf(time)
    if (index < 0) return null
    return (
      <div
        key={time}
        className="agenda-slot-selected pointer-events-none absolute z-30 w-full"
        style={{
          top: `${(index / totalSlots) * 100}%`,
          height: `${(1 / totalSlots) * 100}%`,
        }}
      >
        <span className="absolute left-1 top-1 flex h-4 w-4 items-center justify-center rounded bg-sky-700 text-[10px] font-bold leading-none text-white">
          ✓
        </span>
      </div>
    )
  })
}
