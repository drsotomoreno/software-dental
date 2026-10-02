import type { MouseEvent, PointerEvent } from 'react'
import { useMemo } from 'react'
import type { Appointment, ScheduleColumn } from '@/types/appointment'
import type { ScheduleBlock } from '@/types/scheduleBlock'
import {
  generateTimeSlots,
  getAppointmentPosition,
  isLunchHourSlot,
  SCHEDULER_START_HOUR,
  SCHEDULER_END_HOUR,
  SCHEDULER_SLOT_MINUTES,
  PROCEDURE_TYPE_OPTIONS,
  PROCEDURE_TAILWIND_CLASSES,
} from '@/constants/procedures'
import {
  getBlockSegmentsForColumn,
  isSlotBlocked,
} from '@/utils/scheduleBlocks'
import { SchedulerAppointmentCard } from './SchedulerAppointmentCard'
import { BlockedSlotOverlay } from './BlockedSlotOverlay'
import { AgendaSlotCell, AgendaSlotSelectionHighlight } from './AgendaSlotCell'
import type { SlotSelection } from './CreateAppointmentModal'
import { slotKey } from '@/utils/agendaSlotSelection'

interface DentalSchedulerProps {
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
}
const SLOT_HEIGHT_PX = 48
const totalSlots =
  ((SCHEDULER_END_HOUR - SCHEDULER_START_HOUR) * 60) / SCHEDULER_SLOT_MINUTES
const timelineHeight = totalSlots * SLOT_HEIGHT_PX

export function DentalScheduler({
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
}: DentalSchedulerProps) {
  const timeSlots = useMemo(() => generateTimeSlots(), [])

  const appointmentsByColumn = useMemo(() => {
    const map = new Map<string, Appointment[]>()
    for (const col of columns) {
      map.set(
        col.id,
        appointments.filter((a) => a.columnId === col.id),
      )
    }
    return map
  }, [columns, appointments])

  if (columns.length === 0) {
    return (
      <div className="card text-center text-sm text-slate-500">
        No hay sillas configuradas. Use &quot;Gestionar sillas&quot; para agregar consultorios.
      </div>
    )
  }

  return (
    <div
      className="card overflow-hidden p-0 agenda-scheduler-root"
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Leyenda de procedimientos */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 bg-slate-50 px-4 py-3">
        {PROCEDURE_TYPE_OPTIONS.map((opt) => {
          const cls = PROCEDURE_TAILWIND_CLASSES[opt.color]
          return (
            <span
              key={opt.value}
              className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium ${cls.bg100} ${cls.text700}`}
            >
              <span className={`h-2 w-2 rounded-full ${cls.dot500}`} />
              {opt.label}
            </span>
          )
        })}
        <span className="inline-flex items-center gap-1.5 rounded-full bg-black px-2 py-0.5 text-[10px] font-medium text-white">
          <span className="h-2 w-2 rounded-full bg-white" />
          Bloqueado
        </span>
        {blockMode && !selectionMode && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800">
            Modo bloqueo activo — clic en un horario para bloquear
          </span>
        )}
      </div>

      <div className={`overflow-x-auto ${selectionMode ? 'select-none' : ''}`}>
        <div
          className="grid min-w-max"
          style={{
            gridTemplateColumns: `64px repeat(${columns.length}, minmax(160px, 1fr))`,
          }}
        >
          {/* Header */}
          <div className="sticky top-0 z-20 border-b border-r border-slate-200 bg-white p-2" />
          {columns.map((col) => (
            <div
              key={col.id}
              className="sticky top-0 z-20 border-b border-r border-slate-200 bg-white p-2 text-center text-sm font-semibold text-slate-700"
            >
              {col.name}
            </div>
          ))}

          {/* Time labels + column timelines */}
          <div className="relative border-r border-slate-200">
            {timeSlots.map((slot) => (
              <div
                key={slot}
                className={`flex items-start justify-end border-b border-slate-100 pr-2 text-[10px] text-slate-400 ${
                  isLunchHourSlot(slot) ? 'agenda-lunch-slot' : ''
                }`}
                style={{ height: SLOT_HEIGHT_PX }}
              >
                {slot.endsWith(':00') ? slot : ''}
              </div>
            ))}
          </div>

          {columns.map((col) => (
            <div
              key={col.id}
              data-agenda-column="true"
              className="relative border-r border-slate-200"
              style={{ height: timelineHeight }}
              onPointerDown={onColumnPointerDown}
            >
              {/* Celdas clicables */}
              {timeSlots.map((slot) => {
                const blocked = isSlotBlocked(date, slot, col.id, blocks)
                const selection = { columnId: col.id, date, startTime: slot }
                const selected = selectedKeys?.has(slotKey(selection)) ?? false
                const lunch = isLunchHourSlot(slot)
                return (
                  <AgendaSlotCell
                    key={slot}
                    blocked={blocked}
                    blockMode={blockMode}
                    lunch={lunch}
                    selected={selected}
                    selectionMode={selectionMode}
                    top={`${(timeSlots.indexOf(slot) / totalSlots) * 100}%`}
                    height={`${(1 / totalSlots) * 100}%`}
                    slotMarker={slotKey(selection)}
                    ariaLabel={
                      selectionMode
                        ? `Seleccionar ${col.name} a las ${slot}`
                        : blocked
                          ? `Horario bloqueado ${slot}`
                          : blockMode
                            ? `Bloquear ${col.name} a las ${slot}`
                            : `Crear cita en ${col.name} a las ${slot}`
                    }
                    onClick={(event) => onSlotPress?.(event, selection)}
                    onContextMenu={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                      if (selectionMode || blocked) return
                      onSlotContextMenu?.(event, selection)
                    }}
                  />
                )
              })}

              <div className={selectionMode ? 'pointer-events-none' : undefined}>
                <BlockedSlotOverlay
                  segments={getBlockSegmentsForColumn(date, col.id, blocks)}
                  onBlockClick={onBlockClick}
                />
              </div>

              {/* Citas posicionadas */}
              {(appointmentsByColumn.get(col.id) ?? []).map((apt) => {
                const pos = getAppointmentPosition(apt.startTime, apt.endTime)
                return (
                  <div
                    key={apt.id}
                    className="pointer-events-none absolute w-full"
                    style={{ top: pos.top, height: pos.height }}
                  >
                    <div
                      className={`relative h-full ${selectionMode ? 'pointer-events-none' : 'pointer-events-auto'}`}
                    >
                      <SchedulerAppointmentCard
                        appointment={apt}
                        onClick={onAppointmentClick}
                        onContextMenu={onAppointmentContextMenu}
                      />
                    </div>
                  </div>
                )
              })}

              <AgendaSlotSelectionHighlight
                timeSlots={timeSlots}
                totalSlots={totalSlots}
                selectedTimes={timeSlots.filter((slot) =>
                  selectedKeys?.has(slotKey({ columnId: col.id, date, startTime: slot })),
                )}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
