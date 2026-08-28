import type { ScheduleBlock } from '@/types/scheduleBlock'
import type { BlockSegment } from '@/utils/scheduleBlocks'

interface BlockedSlotOverlayProps {
  segments: BlockSegment[]
  onBlockClick?: (block: ScheduleBlock) => void
}

export function BlockedSlotOverlay({ segments, onBlockClick }: BlockedSlotOverlayProps) {
  if (segments.length === 0) return null

  return (
    <>
      {segments.map(({ block, top, height }) => (
        <button
          key={String(block.id)}
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onBlockClick?.(block)
          }}
          className="agenda-blocked-slot absolute z-10 w-full overflow-hidden rounded-sm border border-slate-900 bg-black px-1 py-0.5 text-left text-white shadow-inner transition hover:bg-slate-900"
          style={{ top, height: `max(${height}, 2%)` }}
          title={block.reason || 'Horario bloqueado — clic para desbloquear'}
        >
          <span className="block truncate text-[10px] font-semibold uppercase tracking-wide">
            Bloqueado
          </span>
          {block.type === 'time_range' && block.startTime && block.endTime && (
            <span className="block truncate text-[9px] text-slate-300">
              {block.startTime} – {block.endTime}
            </span>
          )}
          {block.reason && (
            <span className="block truncate text-[9px] italic text-slate-400">{block.reason}</span>
          )}
        </button>
      ))}
    </>
  )
}
