import type { MouseEvent, PointerEvent } from 'react'

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
  onPointerDown: (event: PointerEvent<HTMLButtonElement>) => void
  onPointerMove: (event: PointerEvent<HTMLButtonElement>) => void
  onPointerUp: (event: PointerEvent<HTMLButtonElement>) => void
}

/** Casilla horaria de la grilla. En modo selección el clic marca; si no, abre la acción habitual. */
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
  onPointerDown,
  onPointerMove,
  onPointerUp,
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
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      className={`absolute w-full scroll-mt-48 border-b border-slate-100 transition ${
        selectionMode ? 'z-40 touch-none' : ''
      } ${
        selectionMode
          ? `cursor-cell hover:bg-dental-100/80 ${lunch && !blocked && !selected ? 'agenda-lunch-slot' : ''}`
          : blocked
            ? 'cursor-not-allowed bg-black/5'
            : lunch
              ? blockMode
                ? 'agenda-lunch-slot hover:bg-black/10'
                : 'agenda-lunch-slot hover:bg-dental-50/60'
              : blockMode
                ? 'hover:bg-black/10'
                : 'hover:bg-dental-50/60'
      } ${selected ? 'bg-dental-100/70' : ''}`}
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
        className="pointer-events-none absolute z-30 w-full border-2 border-dental-600 bg-dental-500/25"
        style={{
          top: `${(index / totalSlots) * 100}%`,
          height: `${(1 / totalSlots) * 100}%`,
        }}
      >
        <span className="absolute left-1 top-1 flex h-4 w-4 items-center justify-center rounded bg-dental-600 text-[10px] font-bold leading-none text-white">
          ✓
        </span>
      </div>
    )
  })
}
