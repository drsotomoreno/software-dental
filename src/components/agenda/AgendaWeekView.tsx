import { useMemo } from 'react'
import type { MouseEvent } from 'react'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import type { Appointment, ScheduleColumn } from '@/types/appointment'
import type { ScheduleBlock } from '@/types/scheduleBlock'
import {
  generateTimeSlots,
  getAppointmentPosition,
  SCHEDULER_END_HOUR,
  SCHEDULER_START_HOUR,
  SCHEDULER_SLOT_MINUTES,
} from '@/constants/procedures'
import {
  getBlockSegmentsForColumn,
  isDayFullyBlocked,
  isSlotBlocked,
} from '@/utils/scheduleBlocks'
import { getChairDisplayStyle } from '@/utils/scheduleColumnStyles'
import { SchedulerAppointmentCard } from './SchedulerAppointmentCard'
import { BlockedSlotOverlay } from './BlockedSlotOverlay'
import type { SlotSelection } from './CreateAppointmentModal'

interface AgendaWeekViewProps {
  weekDays: string[]
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

const SLOT_HEIGHT_PX = 40
const totalSlots =
  ((SCHEDULER_END_HOUR - SCHEDULER_START_HOUR) * 60) / SCHEDULER_SLOT_MINUTES
const timelineHeight = totalSlots * SLOT_HEIGHT_PX

const WEEKDAY_LABELS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

/** Vista semanal — columnas por día y silla/consultorio. */
export function AgendaWeekView({
  weekDays,
  columns,
  appointments,
  blocks,
  blockMode = false,
  onSlotClick,
  onAppointmentClick,
  onAppointmentContextMenu,
  onSlotContextMenu,
  onBlockClick,
}: AgendaWeekViewProps) {
  const timeSlots = useMemo(() => generateTimeSlots(), [])

  const appointmentsByDayAndColumn = useMemo(() => {
    const map = new Map<string, Appointment[]>()
    for (const day of weekDays) {
      for (const column of columns) {
        const key = `${day}::${column.id}`
        map.set(
          key,
          appointments.filter(
            (apt) => apt.startTime.startsWith(day) && apt.columnId === column.id,
          ),
        )
      }
    }
    return map
  }, [weekDays, columns, appointments])

  const columnCount = Math.max(columns.length, 1)
  const minColumnWidth = 88

  return (
    <div
      className="agenda-view agenda-view--week card overflow-hidden p-0 agenda-scheduler-root"
      data-view="week"
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="flex flex-wrap gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2">
        {columns.map((column, index) => {
          const style = getChairDisplayStyle(index)
          return (
            <span
              key={column.id}
              className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium ${style.bg100} ${style.text700}`}
            >
              <span className={`h-2 w-2 rounded-full ${style.dot500}`} />
              {column.name}
            </span>
          )
        })}
      </div>

      <div className="overflow-x-auto">
        <div
          className="agenda-week-grid grid min-w-max"
          style={{
            gridTemplateColumns: `56px repeat(${weekDays.length * columnCount}, minmax(${minColumnWidth}px, 1fr))`,
          }}
        >
          <div className="border-b border-r border-slate-200 bg-slate-50 p-2" />

          {weekDays.map((day, dayIndex) => {
            const parsed = parseISO(`${day}T12:00:00`)
            const isToday = day === format(new Date(), 'yyyy-MM-dd')
            const dayBlocked = isDayFullyBlocked(day, blocks)
            return (
              <div
                key={day}
                className={`border-b border-r border-slate-200 p-2 text-center ${
                  dayBlocked ? 'bg-black text-white' : isToday ? 'bg-dental-50' : 'bg-slate-50'
                }`}
                style={{ gridColumn: `span ${columnCount}` }}
              >
                <p
                  className={`text-[10px] font-medium uppercase ${dayBlocked ? 'text-slate-300' : 'text-slate-500'}`}
                >
                  {WEEKDAY_LABELS[dayIndex]}
                </p>
                <p
                  className={`text-sm font-semibold ${dayBlocked ? 'text-white' : isToday ? 'text-dental-700' : 'text-slate-700'}`}
                >
                  {format(parsed, 'd')}
                </p>
                <p
                  className={`text-[10px] capitalize ${dayBlocked ? 'text-slate-400' : 'text-slate-500'}`}
                >
                  {dayBlocked ? 'Bloqueado' : format(parsed, 'MMM', { locale: es })}
                </p>
              </div>
            )
          })}

          <div className="border-b border-r border-slate-200 bg-slate-50 p-1" />

          {weekDays.map((day) =>
            columns.map((column, columnIndex) => {
              const style = getChairDisplayStyle(columnIndex)
              return (
                <div
                  key={`${day}-${column.id}`}
                  className={`border-b border-r border-slate-200 px-1 py-1 text-center text-[10px] font-semibold ${style.bg100} ${style.text700}`}
                  title={column.name}
                >
                  <span className="line-clamp-2 leading-tight">{column.name}</span>
                </div>
              )
            }),
          )}

          <div className="relative border-r border-slate-200">
            {timeSlots.map((slot) => (
              <div
                key={slot}
                className="flex items-start justify-end border-b border-slate-100 pr-1 text-[10px] text-slate-400"
                style={{ height: SLOT_HEIGHT_PX }}
              >
                {slot.endsWith(':00') ? slot : ''}
              </div>
            ))}
          </div>

          {weekDays.map((day) =>
            columns.map((column, columnIndex) => {
              const chairStyle = getChairDisplayStyle(columnIndex)
              const key = `${day}::${column.id}`
              const dayColumnAppointments = appointmentsByDayAndColumn.get(key) ?? []

              return (
                <div
                  key={`${day}-${column.id}-timeline`}
                  className="relative border-r border-slate-200"
                  style={{ height: timelineHeight }}
                >
                  {timeSlots.map((slot) => {
                    const blocked = isSlotBlocked(day, slot, column.id, blocks)
                    return (
                      <button
                        key={slot}
                        type="button"
                        onClick={() =>
                          onSlotClick({ columnId: column.id, date: day, startTime: slot })
                        }
                        onContextMenu={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          if (!blocked) {
                            onSlotContextMenu?.(e, {
                              columnId: column.id,
                              date: day,
                              startTime: slot,
                            })
                          }
                        }}
                        className={`absolute w-full border-b border-slate-100 transition ${
                          blocked
                            ? 'cursor-not-allowed bg-black/5'
                            : blockMode
                              ? 'hover:bg-black/10'
                              : 'hover:bg-dental-50/60'
                        }`}
                        style={{
                          top: `${(timeSlots.indexOf(slot) / totalSlots) * 100}%`,
                          height: `${(1 / totalSlots) * 100}%`,
                        }}
                        aria-label={
                          blocked
                            ? `Horario bloqueado ${day} ${column.name} ${slot}`
                            : `Crear cita el ${day} en ${column.name} a las ${slot}`
                        }
                      />
                    )
                  })}

                  <BlockedSlotOverlay
                    segments={getBlockSegmentsForColumn(day, column.id, blocks)}
                    onBlockClick={onBlockClick}
                  />

                  {dayColumnAppointments.map((apt) => {
                    const pos = getAppointmentPosition(apt.startTime, apt.endTime)
                    return (
                      <div
                        key={apt.id}
                        className="pointer-events-none absolute z-20 w-full px-0.5"
                        style={{ top: pos.top, height: pos.height }}
                      >
                        <div className="pointer-events-auto h-full">
                          <SchedulerAppointmentCard
                            appointment={apt}
                            columnName={column.name}
                            chairStyle={chairStyle}
                            compact
                            onClick={onAppointmentClick}
                            onContextMenu={onAppointmentContextMenu}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            }),
          )}
        </div>
      </div>
    </div>
  )
}
