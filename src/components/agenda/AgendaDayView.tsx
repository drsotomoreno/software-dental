import { useMemo } from 'react'
import type { MouseEvent } from 'react'
import type { Appointment } from '@/types/appointment'
import type { ScheduleBlock } from '@/types/scheduleBlock'
import { DentalScheduler } from './DentalScheduler'
import type { ScheduleColumn } from '@/types/appointment'
import type { SlotSelection } from './CreateAppointmentModal'

interface AgendaDayViewProps {
  date: string
  columns: ScheduleColumn[]
  appointments: Appointment[]
  blocks: ScheduleBlock[]
  blockMode?: boolean
  onSlotClick: (selection: SlotSelection) => void
  onAppointmentClick?: (appointment: Appointment) => void
  onAppointmentContextMenu?: (event: MouseEvent, appointment: Appointment) => void
  onSlotContextMenu?: (event: MouseEvent, selection: SlotSelection) => void
  onBlockClick?: (block: ScheduleBlock) => void
}

/** Vista diaria — scheduler por sillas/consultorios. */
export function AgendaDayView({
  date,
  columns,
  appointments,
  blocks,
  blockMode = false,
  onSlotClick,
  onAppointmentClick,
  onAppointmentContextMenu,
  onSlotContextMenu,
  onBlockClick,
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
        onSlotClick={onSlotClick}
        onAppointmentClick={onAppointmentClick}
        onAppointmentContextMenu={onAppointmentContextMenu}
        onSlotContextMenu={onSlotContextMenu}
        onBlockClick={onBlockClick}
      />
    </div>
  )
}
