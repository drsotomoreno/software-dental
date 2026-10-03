import { useMemo } from 'react'
import type { MouseEvent, PointerEvent } from 'react'
import type { SlotSelection } from './CreateAppointmentModal'
import type { Appointment } from '@/types/appointment'
import type { ScheduleBlock } from '@/types/scheduleBlock'
import { DentalScheduler } from './DentalScheduler'
import type { ScheduleColumn } from '@/types/appointment'
interface AgendaDayViewProps {
  date: string
  columns: ScheduleColumn[]
  appointments: Appointment[]
  blocks: ScheduleBlock[]
  blockMode?: boolean
  selectionMode?: boolean
  selectedKeys?: ReadonlySet<string>
  onAppointmentClick?: (appointment: Appointment) => void
  onAppointmentContextMenu?: (event: MouseEvent, appointment: Appointment) => void
  onSlotContextMenu?: (event: MouseEvent, selection: SlotSelection) => void
  onBlockClick?: (block: ScheduleBlock) => void
  onSlotPress?: (event: MouseEvent<HTMLButtonElement>, selection: SlotSelection) => void
  onColumnPointerDown?: (event: PointerEvent<HTMLElement>) => void
  onColumnContextMenu?: (event: MouseEvent<HTMLDivElement>) => void
}

/** Vista diaria — scheduler por sillas/consultorios. */
export function AgendaDayView({
  date,
  columns,
  appointments,
  blocks,
  blockMode = false,
  selectionMode = false,
  selectedKeys,
  onAppointmentClick,
  onAppointmentContextMenu,
  onSlotContextMenu,
  onBlockClick,
  onSlotPress,
  onColumnPointerDown,
  onColumnContextMenu,
}: AgendaDayViewProps) {
  const dayAppointments = useMemo(
    () => appointments.filter((apt) => apt.startTime.startsWith(date)),
    [appointments, date],
  )

  const dayBlocks = useMemo(
    () => blocks.filter((block) => block.date === date),
    [blocks, date],
  )

  return (
    <div className="agenda-view agenda-view--day" data-view="day">
      <DentalScheduler
        date={date}
        columns={columns}
        appointments={dayAppointments}
        blocks={dayBlocks}
        blockMode={blockMode}
        selectionMode={selectionMode}
        selectedKeys={selectedKeys}
        onAppointmentClick={onAppointmentClick}
        onAppointmentContextMenu={onAppointmentContextMenu}
        onSlotContextMenu={onSlotContextMenu}
        onBlockClick={onBlockClick}
        onSlotPress={onSlotPress}
        onColumnPointerDown={onColumnPointerDown}
        onColumnContextMenu={onColumnContextMenu}
      />
    </div>
  )
}
